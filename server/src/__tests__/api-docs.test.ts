import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { apiDocsRoutes } from "../routes/api-docs.js";
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});
async function origin() {
  const app = express();
  app.use(apiDocsRoutes());
  app.get("/api/private-test", (_req, res) => res.status(401).json({ error: "Unauthorized" }));
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing listener");
  return `http://127.0.0.1:${address.port}`;
}
describe("public connection documentation", () => {
  it("serves the exact guide anonymously and escapes it for browsers", async () => {
    const base = await origin();
    const guide = readFileSync(new URL("../../../CONNECTION.md", import.meta.url), "utf8");
    const raw = await fetch(base + "/api-docs/CONNECTION.md");
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toContain("text/plain");
    expect(await raw.text()).toBe(guide);
    const page = await fetch(base + "/api-docs");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await page.text();
    expect(html).toContain("&lt;company-id&gt;");
    expect(html).not.toContain("<company-id>");
    expect(html).toContain('href="/api-docs/CONNECTION.md"');
  });
  it("leaves protected API authorization and cache headers unchanged", async () => {
    const response = await fetch(await origin() + "/api/private-test");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
