import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { companyJulesSources, julesSessions } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import { fakeDb } from "./fixtures/fake-db.js";
import { supervisorRoutes } from "../routes/supervisor.js";

const ADMIN = { type: "board", userId: "admin-1", isInstanceAdmin: true, source: "session" };
function appFor(db: unknown, actor: Record<string, unknown>) {
  const app = express(); app.use(express.json());
  app.use((req: Request, _r: Response, next: NextFunction) => { req.actor = actor as never; next(); });
  app.use("/api", supervisorRoutes(db as never));
  app.use((err: unknown, _r: Request, res: Response, _n: NextFunction) => { const status = err instanceof HttpError ? err.status : 500; res.status(status).json({ error: (err as Error).message }); });
  return app;
}
const SEEDED = [[companyJulesSources, [{ id: "src1", companyId: "company-a", repository: "owner/repo", startingBranch: "main" }]], [julesSessions, [{ id: "s1", companyId: "company-a", companySourceId: "src1", agentId: "a1", issueId: "i1", paperclipRunId: "run-1", julesSessionId: "remote-1", status: "COMPLETED_UNVALIDATED", pullRequestUrl: null, startedAt: new Date(), finishedAt: null }]]] as Array<[unknown, Record<string, unknown>[]]>;

describe("supervisor artifact-read route (local contract)", () => {
  beforeEach(() => { delete process.env.GITHUB_TOKEN; });
  it("requires board access", async () => {
    const res = await request(appFor(fakeDb().db, { type: "none", source: "none" })).post("/api/companies/company-a/supervisor/artifact/read").send({ paperclipRunId: "run-1" });
    expect(res.status).toBe(403);
  });
  it("enforces company tenancy for foreign agent keys", async () => {
    const res = await request(appFor(fakeDb().db, { type: "agent", agentId: "x", companyId: "company-c" })).post("/api/companies/company-a/supervisor/artifact/read").send({ paperclipRunId: "run-1" });
    expect(res.status).toBe(403);
  });
  it("returns a recoverable structured envelope (retrieval is not acceptance) for an authorized board caller", async () => {
    const res = await request(appFor(fakeDb(SEEDED).db, ADMIN)).post("/api/companies/company-a/supervisor/artifact/read").send({ paperclipRunId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.artifactRetrieved).toBe(false);
    expect(res.body.code).toBe("GITHUB_TOKEN_MISSING");
    expect(res.body.product.paperclipRunId).toBe("run-1");
  });
  it("rejects a malformed body", async () => {
    const res = await request(appFor(fakeDb().db, ADMIN)).post("/api/companies/company-a/supervisor/artifact/read").send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
