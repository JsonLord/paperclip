import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";

// The build packages the same root guide inside dist for standalone installs.
const packagedGuide = new URL("../CONNECTION.md", import.meta.url);
const connectionGuide = readFileSync(
  existsSync(packagedGuide) ? packagedGuide : new URL("../../../CONNECTION.md", import.meta.url),
  "utf8",
);
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

/** Public static documentation, without database or credential access. */
export function apiDocsRoutes() {
  const router = Router();
  router.use("/api-docs", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=300");
    next();
  });
  router.get("/api-docs/CONNECTION.md", (_req, res) => {
    res.type("text/plain").send(connectionGuide);
  });
  router.get("/api-docs", (_req, res) => {
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Paperclip connection guide</title><style>body{max-width:72rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;color:#18202b;background:#fafafa}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:1rem/1.65 ui-monospace,monospace}a{color:#215eb6}</style></head><body><main><h1>Paperclip connection guide</h1><p><a href="/api-docs/CONNECTION.md">Raw CONNECTION.md for agents and download</a> · <a href="/">Open the board</a></p><pre>${escapeHtml(connectionGuide)}</pre></main></body></html>`);
  });
  return router;
}
