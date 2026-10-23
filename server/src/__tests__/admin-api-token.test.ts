import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import pino from "pino";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { agentApiKeys, agents, authUsers, instanceUserRoles } from "@paperclipai/db";
import { resolveAdminApiToken, adminApiTokenStatus } from "../auth/admin-api-token.js";
import { accessRoutes } from "../routes/access.js";
import { actorMiddleware } from "../middleware/auth.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { HTTP_CREDENTIAL_REDACTION } from "../middleware/logger.js";
import { assertBoard, assertCompanyAccess } from "../routes/authz.js";
import { fakeDb } from "./fixtures/fake-db.js";

const TOKEN = "test-only-admin-credential-0123456789abcdef";
const EMAIL = "operator@example.test";
const keys = ["PAPERCLIP_ADMIN_API_TOKEN", "PAPERCLIP_ADMIN_API_EMAIL", "BETTER_AUTH_SECRET", "PAPERCLIP_AGENT_JWT_SECRET", "PAPERCLIP_ADMIN_PASSWORD"];
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
let server: Server | undefined;
afterEach(async () => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  if (server) { await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; }
});
function setup() {
  process.env.PAPERCLIP_ADMIN_API_TOKEN = TOKEN;
  process.env.PAPERCLIP_ADMIN_API_EMAIL = EMAIL;
  const store = fakeDb([
    [authUsers, [{ id: "existing-admin", email: EMAIL }]],
    [instanceUserRoles, [{ id: "role", userId: "existing-admin", role: "instance_admin" }]],
    [agentApiKeys, []], [agents, []],
  ]);
  return store;
}

describe("native admin API token", () => {
  it("reports safe server readiness without returning token material", async () => {
    const { db } = setup();
    expect(await adminApiTokenStatus(db)).toMatchObject({ enabled: true, minimumLengthValid: true, independentCredential: true });
    expect(JSON.stringify(await adminApiTokenStatus(db))).not.toContain(TOKEN);
    process.env.PAPERCLIP_ADMIN_API_TOKEN = "short";
    expect(await adminApiTokenStatus(db)).toMatchObject({ enabled: false, minimumLengthValid: false });
    process.env.PAPERCLIP_ADMIN_API_TOKEN = TOKEN;
    process.env.BETTER_AUTH_SECRET = TOKEN;
    expect(await adminApiTokenStatus(db)).toMatchObject({ enabled: false, independentCredential: false });
  });
  it("redacts bearer credentials and cookies from serialized HTTP logs", () => {
    let output = "";
    const log = pino({ redact: { paths: HTTP_CREDENTIAL_REDACTION, censor: "[REDACTED]" } }, { write: (line) => { output += line; } });
    log.info({ req: { headers: { authorization: "Bearer " + TOKEN, cookie: "test-session-cookie" } }, res: { headers: { "set-cookie": "test-response-cookie" } } }, "safe request");
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("test-session-cookie");
    expect(output).not.toContain("test-response-cookie");
    expect(output).toContain("safe request");
    expect(output).toContain("[REDACTED]");
  });
  it("authenticates only an exact separate token bound to one existing instance admin", async () => {
    const { db } = setup();
    expect(await resolveAdminApiToken(db, TOKEN)).toBe("existing-admin");
    expect(await resolveAdminApiToken(db, TOKEN + "wrong")).toBeNull();
    expect(await resolveAdminApiToken(db, "")).toBeNull();
    process.env.PAPERCLIP_ADMIN_API_EMAIL = "other@example.test";
    expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
  });
  it("requires opt-in configuration and refuses signing keys or the UI password", async () => {
    const { db } = setup();
    delete process.env.PAPERCLIP_ADMIN_API_TOKEN;
    expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
    process.env.PAPERCLIP_ADMIN_API_TOKEN = "short";
    expect(await resolveAdminApiToken(db, "short")).toBeNull();
    process.env.PAPERCLIP_ADMIN_API_TOKEN = TOKEN;
    for (const key of ["BETTER_AUTH_SECRET", "PAPERCLIP_AGENT_JWT_SECRET", "PAPERCLIP_ADMIN_PASSWORD"]) {
      process.env[key] = TOKEN;
      expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
      delete process.env[key];
    }
    delete process.env.PAPERCLIP_ADMIN_API_EMAIL;
    expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
  });
  it("enforces identity uniqueness and immediate role/token revocation", async () => {
    const { db, rows } = setup();
    rows.get(authUsers)!.push({ id: "duplicate", email: EMAIL });
    expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
    rows.get(authUsers)!.pop();
    rows.set(instanceUserRoles, [{ id: "role", userId: "existing-admin", role: "member" }]);
    expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
    rows.set(instanceUserRoles, [{ id: "role", userId: "existing-admin", role: "instance_admin" }]);
    process.env.PAPERCLIP_ADMIN_API_TOKEN = TOKEN + "rotated";
    expect(await resolveAdminApiToken(db, TOKEN)).toBeNull();
    expect(await resolveAdminApiToken(db, TOKEN + "rotated")).toBe("existing-admin");
    rows.set(authUsers, []);
    expect(await resolveAdminApiToken(db, TOKEN + "rotated")).toBeNull();
  });
  it("uses native board authorization over HTTP while preserving cookies and scoped agent keys", async () => {
    const { db, rows } = setup();
    const agentToken = "test-only-agent-key";
    rows.set(agentApiKeys, [{ id: "key", keyHash: createHash("sha256").update(agentToken).digest("hex"), revokedAt: null, agentId: "agent", companyId: "company-a" }]);
    rows.set(agents, [{ id: "agent", companyId: "company-a", status: "idle" }]);
    const resolveSession = vi.fn(async () => ({ user: { id: "cookie-admin" }, session: { id: "cookie-session" } }) as never);
    rows.get(instanceUserRoles)!.push({ id: "cookie-role", userId: "cookie-admin", role: "instance_admin" });
    const app = express();
    app.use(actorMiddleware(db, { deploymentMode: "authenticated", resolveSession }));
    app.use(boardMutationGuard());
    app.post("/api/admin-probe", (req, res) => { assertBoard(req); res.json({ userId: req.actor.userId }); });
    app.get("/api/admin-probe", (req, res) => { assertBoard(req); assertCompanyAccess(req, "company-b"); res.json(req.actor); });
    app.get("/api/companies/:id/probe", (req, res) => { assertCompanyAccess(req, req.params.id); res.json({ type: req.actor.type }); });
    app.use("/api", accessRoutes(db, { deploymentMode: "authenticated", deploymentExposure: "public", bindHost: "127.0.0.1", allowedHostnames: [] }));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status ?? 500).json({ error: "denied" }));
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const get = (path: string, token?: string) => fetch(base + path, { headers: token ? { Authorization: "Bearer " + token } : {} });
    const admin = await get("/api/admin-probe", TOKEN);
    expect(admin.status).toBe(200);
    expect(await admin.json()).toMatchObject({ type: "board", userId: "existing-admin", source: "admin_token", isInstanceAdmin: true });
    expect(resolveSession).not.toHaveBeenCalled();
    expect((await get("/api/admin/api-token/status", TOKEN)).status).toBe(200);
    expect((await get("/api/admin/api-token/status", "wrong-token")).status).toBe(401);
    expect((await get("/api/admin-probe", "wrong-token")).status).toBe(403);
    expect((await get("/api/companies/company-a/probe", agentToken)).status).toBe(200);
    expect((await get("/api/companies/company-b/probe", agentToken)).status).toBe(403);
    expect((await get("/api/admin-probe", agentToken)).status).toBe(403);
    expect((await get("/api/admin-probe")).status).toBe(200);
    expect(resolveSession).toHaveBeenCalledTimes(1);
    expect((await fetch(base + "/api/admin-probe", { method: "POST", headers: { Authorization: "Bearer " + TOKEN } })).status).toBe(200);
    expect((await fetch(base + "/api/admin-probe", { method: "POST" })).status).toBe(403);
    rows.set(instanceUserRoles, rows.get(instanceUserRoles)!.filter((row) => row.userId !== "cookie-admin"));
    expect((await get("/api/admin/api-token/status")).status).toBe(403);
  });
  it("fails closed on a database error without falling back to a cookie identity", async () => {
    setup();
    const db = { select: () => { throw new Error("database unavailable"); } };
    const resolveSession = vi.fn();
    const req = { header: (name: string) => name === "authorization" ? "Bearer " + TOKEN : undefined };
    const next = vi.fn();
    await actorMiddleware(db as never, { deploymentMode: "authenticated", resolveSession })(req as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(resolveSession).not.toHaveBeenCalled();
    expect((req as any).actor.type).toBe("none");
  });
});
