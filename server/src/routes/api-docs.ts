import { Router } from "express";

export const API_DOCUMENTATION = {
  title: "FounderOS / Paperclip Control Plane API",
  version: "1.0.0",
  description: "API endpoints exposed by Paperclip deployment on Hugging Face Spaces for orchestrating AI-agent companies.",
  endpoints: [
    {
      method: "GET",
      path: "/health",
      purpose: "Returns HTTP 200 and operational status when the app is ready.",
      request: "None",
      response: {
        status: "ok",
        version: "1.0.0",
        deploymentMode: "authenticated",
        deploymentExposure: "private",
        authReady: true,
        bootstrapStatus: "ready"
      }
    },
    {
      method: "GET",
      path: "/api-docs",
      purpose: "Documents all available API endpoints and schemas.",
      request: "None",
      response: "Self-referential API documentation object or HTML page."
    },
    {
      method: "GET",
      path: "/api/companies",
      purpose: "List companies managed by Paperclip.",
      request: "None",
      response: [
        {
          id: "comp_123",
          name: "FounderOS Company",
          description: "AI operating business",
          createdAt: "2026-09-19T00:00:00.000Z"
        }
      ]
    },
    {
      method: "POST",
      path: "/api/companies",
      purpose: "Create a new company.",
      request: {
        name: "Acme AI Corp",
        description: "Autonomous SaaS business"
      },
      response: {
        id: "comp_456",
        name: "Acme AI Corp",
        description: "Autonomous SaaS business",
        createdAt: "2026-09-19T00:00:00.000Z"
      }
    },
    {
      method: "POST",
      path: "/api/companies/import/github",
      purpose: "Onboard and bootstrap a FounderOS company from a GitHub repository.",
      request: {
        repository: "Leon4gr45/company-repo",
        name: "FounderOS Startup",
        contentCommit: "abc1234567890def"
      },
      response: {
        company: {
          id: "comp_789",
          name: "FounderOS Startup",
          firmGithubRepo: "Leon4gr45/company-repo"
        },
        bootstrapped: true,
        resourcePacks: ["venture-thesis", "market-core"]
      }
    },
    {
      method: "GET",
      path: "/api/agents",
      purpose: "List AI agents across companies and org charts.",
      request: "None",
      response: [
        {
          id: "agent_01",
          companyId: "comp_123",
          name: "CEO Agent",
          role: "CEO",
          adapterType: "jules"
        }
      ]
    },
    {
      method: "GET",
      path: "/api/projects",
      purpose: "List projects in companies.",
      request: "None",
      response: [
        {
          id: "proj_01",
          companyId: "comp_123",
          name: "MVP Product Launch",
          status: "in_progress"
        }
      ]
    },
    {
      method: "GET",
      path: "/api/issues",
      purpose: "List work tickets and issues assigned to agents.",
      request: "Query parameter: ?companyId=comp_123",
      response: [
        {
          id: "issue_01",
          companyId: "comp_123",
          title: "Validate ICP demand",
          status: "in_progress",
          assigneeAgentId: "agent_01"
        }
      ]
    },
    {
      method: "GET",
      path: "/api/goals",
      purpose: "List strategic business goals.",
      request: "Query parameter: ?companyId=comp_123",
      response: [
        {
          id: "goal_01",
          companyId: "comp_123",
          title: "Reach $10k MRR",
          status: "active"
        }
      ]
    }
  ]
};

export function apiDocsRoutes() {
  const router = Router();

  router.get("/", (req, res) => {
    const acceptsHtml = req.headers.accept?.includes("text/html");
    if (acceptsHtml && !req.query.json) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${API_DOCUMENTATION.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #f8fafc; }
    h1 { color: #38bdf8; }
    p { color: #94a3b8; }
    .endpoint { border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #1e293b; }
    .method { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-right: 8px; }
    .method.GET { background: #0284c7; color: white; }
    .method.POST { background: #16a34a; color: white; }
    .path { font-family: monospace; font-size: 16px; font-weight: bold; color: #f1f5f9; }
    .purpose { margin: 8px 0; color: #cbd5e1; }
    pre { background: #0f172a; padding: 12px; border-radius: 6px; overflow-x: auto; color: #e2e8f0; font-size: 13px; }
    .json-link { margin-top: 20px; display: inline-block; color: #38bdf8; text-decoration: none; }
    .json-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>${API_DOCUMENTATION.title}</h1>
  <p>${API_DOCUMENTATION.description}</p>
  <a class="json-link" href="?json=1">View raw JSON</a>
  <h2 style="margin-top: 24px;">Endpoints</h2>
  ${API_DOCUMENTATION.endpoints.map((ep) => `
    <div class="endpoint">
      <div>
        <span class="method ${ep.method}">${ep.method}</span>
        <span class="path">${ep.path}</span>
      </div>
      <div class="purpose">${ep.purpose}</div>
      <div><strong>Request:</strong></div>
      <pre>${typeof ep.request === "string" ? ep.request : JSON.stringify(ep.request, null, 2)}</pre>
      <div><strong>Response:</strong></div>
      <pre>${JSON.stringify(ep.response, null, 2)}</pre>
    </div>
  `).join("")}
</body>
</html>`;
      res.status(200).set("Content-Type", "text/html").send(html);
      return;
    }

    res.json(API_DOCUMENTATION);
  });

  return router;
}
