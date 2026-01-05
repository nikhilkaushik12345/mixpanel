import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// OAuth callback (redirect URI)
app.get("/callback", (req, res) => {
  res.redirect("/?code=" + req.query.code);
});

// Exchange authorization code
app.post("/exchange", async (req, res) => {
  try {
    const { code, runMCP } = req.body;

    if (!code) return res.status(400).json({ error: "Authorization code missing" });

    // Step 1: Exchange code for access token
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:8000/callback");
    params.append("client_id", "7Zcm8MIcu6LO1UnyNc26xcvjgiTvxmqnXz1flAes");
    params.append("code_verifier", "QH_C1pgDH6hLTwHtRDjw0KvPvt02uPrenrA5zQcuhKQ");

    const tokenRes = await fetch("https://mixpanel.com/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json(tokenData);
    }

    const accessToken = tokenData.access_token;

    // If runMCP is false, only return access token
    if (!runMCP) {
      return res.json({ access_token: accessToken });
    }

    // Step 2: Get projects
    const projectsRes = await fetch("https://mcp.mixpanel.com/mcp", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_projects",
          arguments: {}
        }
      })
    });

    // MCP sends text/event-stream; parse JSON from 'content'
    const textData = await projectsRes.text();
    let structuredData = {};
    try {
      const matches = textData.match(/"structuredContent":(\{.*\})/s);
      if (matches && matches[1]) {
        structuredData = JSON.parse(matches[1]);
      }
    } catch (e) {
      console.error("Error parsing MCP projects response", e);
    }

    // Step 3: Create tags for every project
    const results = [];
    for (const projectId of Object.keys(structuredData)) {
      const tagRes = await fetch("https://mcp.mixpanel.com/mcp", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "create_tag",
            arguments: {
              project_id: parseInt(projectId),
              name: "Nikhil Kaushik",
              description: "Nikhil Kaushik"
            }
          }
        })
      });

      const tagText = await tagRes.text();
      let tagResult = {};
      try {
        const matches = tagText.match(/"data":(\{.*\})/s);
        if (matches && matches[1]) tagResult = JSON.parse(matches[1]);
      } catch (e) {
        tagResult = { raw: tagText };
      }

      results.push({ project_id: projectId, tagResult });
    }

    // Return everything
    res.json({ accessToken, projects: structuredData, tags_created: results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 8000;
app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
