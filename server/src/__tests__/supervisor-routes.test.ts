import express, { type Request } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { controllerLeases, julesSessions } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import { fakeDb } from "./fixtures/fake-db.js";
import { supervisorRoutes } from "../routes/supervisor.js";

// Local contract coverage for WP2: authentication, company tenancy, response shape,
// and the non-racy lease transitions. The genuine two-controller race, monotonic
// fencing-token increment, and stale-token rejection under concurrency are proven in
// controller-lease.pg.test.ts against real PostgreSQL (NOT_RUN without DATABASE_URL).

const ADMIN = { type: "board", userId: "admin-1", isInstanceAdmin: true, source: "session" };

function appFor(db: unknown, actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request).actor = actor as never;
    next();
  });
  app.use("/api", supervisorRoutes(db as never));
  app.use((err: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  });
  return app;
}

describe("supervisor controller-lease routes (local contract)", () => {
  it("grants the first acquire and refuses a second live holder", async () => {
    const { db } = fakeDb([], { unique: [[controllerLeases, ["companyId"]]] });
    const app = appFor(db, ADMIN);

    const first = await request(app).post("/api/companies/company-a/supervisor/lease/acquire").send({ controllerId: "controller-A" });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("HELD");
    expect(first.body.lease.controllerId).toBe("controller-A");
    expect(first.body.lease.fencingToken).toBe(1);

    const second = await request(app).post("/api/companies/company-a/supervisor/lease/acquire").send({ controllerId: "controller-B" });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("LEASE_HELD_BY_OTHER");
    expect(second.body.holderControllerId).toBe("controller-A");

    const read = await request(app).get("/api/companies/company-a/supervisor/lease");
    expect(read.status).toBe(200);
    expect(read.body.lease.controllerId).toBe("controller-A");
  });

  it("verifies the current token and rejects an unknown token", async () => {
    const { db } = fakeDb([], { unique: [[controllerLeases, ["companyId"]]] });
    const app = appFor(db, ADMIN);
    await request(app).post("/api/companies/company-a/supervisor/lease/acquire").send({ controllerId: "controller-A" });

    const ok = await request(app).post("/api/companies/company-a/supervisor/lease/verify").send({ controllerId: "controller-A", fencingToken: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.authorized).toBe(true);

    const stale = await request(app).post("/api/companies/company-a/supervisor/lease/verify").send({ controllerId: "controller-A", fencingToken: 99 });
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe("STALE_FENCING_TOKEN");
  });

  it("requires board access and enforces company tenancy for agent keys", async () => {
    const anon = appFor(fakeDb().db, { type: "none", source: "none" });
    expect((await request(anon).get("/api/companies/company-a/supervisor/lease")).status).toBe(403);

    const otherCompany = appFor(fakeDb().db, { type: "agent", agentId: "a1", companyId: "company-b" });
    expect((await request(otherCompany).get("/api/companies/company-a/supervisor/lease")).status).toBe(403);
  });

  it("lists only the caller's company Jules sessions and paginates", async () => {
    const seeded = [
      [julesSessions, [
        { id: "s1", companyId: "company-a", agentId: "a1", issueId: "i1", paperclipRunId: "r1", julesSessionId: "remote-1", status: "IN_PROGRESS", completionCandidate: false, pullRequestUrl: null, startedAt: new Date("2026-10-24T10:00:00Z"), finishedAt: null },
        { id: "s2", companyId: "company-a", agentId: "a2", issueId: "i2", paperclipRunId: "r2", julesSessionId: "remote-2", status: "COMPLETED_UNVALIDATED", completionCandidate: true, pullRequestUrl: "https://example.invalid/pr/2", startedAt: new Date("2026-10-24T11:00:00Z"), finishedAt: null },
        { id: "s3", companyId: "company-b", agentId: "b1", issueId: "j1", paperclipRunId: "r3", julesSessionId: "remote-3", status: "IN_PROGRESS", completionCandidate: false, pullRequestUrl: null, startedAt: new Date("2026-10-24T09:00:00Z"), finishedAt: null },
      ]],
    ] as Array<[unknown, Record<string, unknown>[]]>;
    const { db } = fakeDb(seeded);
    const app = appFor(db, ADMIN);

    const page = await request(app).get("/api/companies/company-a/jules/sessions");
    expect(page.status).toBe(200);
    expect(page.body.sessions.map((s: { id: string }) => s.id).sort()).toEqual(["s1", "s2"]);

    const limited = await request(app).get("/api/companies/company-a/jules/sessions?limit=1");
    expect(limited.body.sessions).toHaveLength(1);
    expect(limited.body.nextOffset).not.toBeNull();

    const cross = appFor(db, { type: "agent", agentId: "x", companyId: "company-c" });
    expect((await request(cross).get("/api/companies/company-a/jules/sessions")).status).toBe(403);
  });
});
