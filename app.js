import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// OAuth callback
app.get("/callback", (req, res) => {
  res.redirect("/?code=" + req.query.code);
});

// Exchange code for access token
app.post("/exchange", async (req, res) => {
  try {
    const { code } = req.body;

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:8000/callback");
    params.append("client_id", "7Zcm8MIcu6LO1UnyNc26xcvjgiTvxmqnXz1flAes");
    params.append("code_verifier", "qowgHWiPUC7WCA4IaYDCiZU9UcTUoT2SnIAoRRuUc9M");

    const tokenRes = await fetch("https://mixpanel.com/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();
    res.json(tokenData);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get projects and create tags
app.post("/projects", async (req, res) => {
  try {
    const { access_token } = req.body;

    // 1️⃣ Get projects
    const projectsRes = await fetch("https://mcp.mixpanel.com/mcp", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_projects", arguments: {} }
      })
    });

    const projectsRaw = await projectsRes.text();
    const dataMatch = projectsRaw.match(/data: (.*)/);
    if (!dataMatch) return res.status(500).json({ error: "Invalid project response" });
    const projectsData = JSON.parse(dataMatch[1]);
    const projects = projectsData.result?.structuredContent || {};

    // 2️⃣ Create tags for each project
    const results = [];
    for (const projectId in projects) {
      const tagRes = await fetch("https://mcp.mixpanel.com/mcp", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "create_tag",
            arguments: {
              project_id: Number(projectId),
              name: "Nikhil Kaushik",
              description: "Nikhil Kaushik"
            }
          }
        })
      });

      const tagRaw = await tagRes.text();
      const tagDataMatch = tagRaw.match(/data: (.*)/);
      const tagData = tagDataMatch ? JSON.parse(tagDataMatch[1]) : {};
      results.push({ project_id: projectId, tag_result: tagData });
    }

    res.json({ projects, tags_created: results });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));
