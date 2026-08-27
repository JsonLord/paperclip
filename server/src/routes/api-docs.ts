import express from "express";

export function apiDocsRoutes() {
  const router = express.Router();

  router.get("/api-docs", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Paperclip API Documentation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
    h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
    h2 { color: #222; margin-top: 1.5rem; }
    .endpoint { background: #f9f9f9; border-left: 4px solid #4a90e2; padding: 1rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; }
    .method { font-weight: bold; color: #4a90e2; display: inline-block; width: 70px; }
    .path { font-family: monospace; font-size: 1.1em; }
    pre { background: #eee; padding: 0.5rem; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Paperclip API Documentation</h1>

  <div class="endpoint">
    <h2><span class="method">GET</span> <span class="path">/health</span> or <span class="path">/api/health</span></h2>
    <p><strong>Purpose:</strong> Health check endpoint returning status 200 when ready.</p>
    <p><strong>Response Example:</strong></p>
    <pre><code>{
  "status": "ok",
  "deploymentMode": "authenticated",
  "deploymentExposure": "public"
}</code></pre>
  </div>

  <div class="endpoint">
    <h2><span class="method">GET</span> <span class="path">/api-docs</span></h2>
    <p><strong>Purpose:</strong> Interactive/HTML API documentation page listing all available endpoints.</p>
  </div>

  <div class="endpoint">
    <h2><span class="method">GET</span> <span class="path">/api/companies</span></h2>
    <p><strong>Purpose:</strong> List all companies managed by the control plane.</p>
    <p><strong>Response Example:</strong></p>
    <pre><code>[
  {
    "id": "comp_123",
    "name": "Acme Corp",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]</code></pre>
  </div>

  <div class="endpoint">
    <h2><span class="method">POST</span> <span class="path">/api/companies</span></h2>
    <p><strong>Purpose:</strong> Create a new company.</p>
    <p><strong>Request Example:</strong></p>
    <pre><code>{
  "name": "Acme Corp"
}</code></pre>
    <p><strong>Response Example:</strong></p>
    <pre><code>{
  "id": "comp_123",
  "name": "Acme Corp",
  "createdAt": "2025-01-01T00:00:00.000Z"
}</code></pre>
  </div>

  <div class="endpoint">
    <h2><span class="method">GET</span> <span class="path">/api/agents</span></h2>
    <p><strong>Purpose:</strong> List all agents across companies.</p>
    <p><strong>Response Example:</strong></p>
    <pre><code>[
  {
    "id": "agent_456",
    "name": "CEO Agent",
    "role": "ceo"
  }
]</code></pre>
  </div>

  <div class="endpoint">
    <h2><span class="method">POST</span> <span class="path">/api/agents</span></h2>
    <p><strong>Purpose:</strong> Register a new agent.</p>
    <p><strong>Request Example:</strong></p>
    <pre><code>{
  "name": "Dev Agent",
  "companyId": "comp_123",
  "role": "engineer"
}</code></pre>
    <p><strong>Response Example:</strong></p>
    <pre><code>{
  "id": "agent_789",
  "name": "Dev Agent",
  "companyId": "comp_123",
  "role": "engineer"
}</code></pre>
  </div>

  <div class="endpoint">
    <h2><span class="method">GET</span> <span class="path">/api/projects</span></h2>
    <p><strong>Purpose:</strong> List projects within companies.</p>
    <p><strong>Response Example:</strong></p>
    <pre><code>[
  {
    "id": "proj_001",
    "name": "Website Redesign",
    "companyId": "comp_123"
  }
]</code></pre>
  </div>

  <div class="endpoint">
    <h2><span class="method">GET</span> <span class="path">/api/issues</span></h2>
    <p><strong>Purpose:</strong> List tasks/issues.</p>
    <p><strong>Response Example:</strong></p>
    <pre><code>[
  {
    "id": "issue_101",
    "title": "Fix login bug",
    "status": "open"
  }
]</code></pre>
  </div>

</body>
</html>`);
  });

  return router;
}
