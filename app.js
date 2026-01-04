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

// Exchange code + call MCP
app.post("/exchange", async (req, res) => {
  try {
    const { code } = req.body;

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:8000/callback");
    params.append("client_id", "7Zcm8MIcu6LO1UnyNc26xcvjgiTvxmqnXz1flAes");
    params.append("code_verifier", "qowgHWiPUC7WCA4IaYDCiZU9UcTUoT2SnIAoRRuUc9M");

    // 1️⃣ Exchange authorization code for access token
    const tokenRes = await fetch("https://mcp.mixpanel.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    const token = await tokenRes.json();
    if (!token.access_token) return res.status(400).json(token);

    const accessToken = token.access_token;

    // 2️⃣ Get projects
    const projectsRes = await fetch("https://mcp.mixpanel.com/mcp", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_projects",
          arguments: {}
        }
      })
    });

    const projectsData = await projectsRes.json();
    const projects = projectsData.result?.projects || [];

    // 3️⃣ Create tag for each project_id
    const results = [];

    for (const project of projects) {
      const tagRes = await fetch("https://mcp.mixpanel.com/mcp", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "create_tag",
            arguments: {
              project_id: project.project_id,
              name: "Nikhil Kaushik"
            }
          }
        })
      });

      const tagData = await tagRes.json();
      results.push({
        project_id: project.project_id,
        result: tagData
      });
    }

    res.json({
      projects,
      tags_created: results
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));
