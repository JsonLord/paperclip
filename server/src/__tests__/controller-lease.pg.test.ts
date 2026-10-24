import { randomUUID } from "node:crypto";
import express, { type Request } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { applyPendingMigrations, companies, controllerLeases, createDb, type Db } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import { controllerLeaseService } from "../services/controller-lease.js";
import { supervisorRoutes } from "../routes/supervisor.js";

// Real PostgreSQL concurrency + locking proof for WP2 (GATE05-R). These cases cannot be
// honestly proven against an in-memory fake, so they are gated on DATABASE_URL and report
// NOT_RUN when it is absent, never a fake PASS.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

const ADMIN = { type: "board", userId: "admin-1", isInstanceAdmin: true, source: "session" };

function appFor(db: Db, actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as Request).actor = actor as never; next(); });
  app.use("/api", supervisorRoutes(db));
  app.use((err: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof HttpError ? err.status : 500).json({ error: (err as Error).message });
  });
  return app;
}

suite("controller-lease single-controller fencing (real PostgreSQL)", () => {
  let db: Db;
  beforeAll(async () => {
    await applyPendingMigrations(url!);
    db = createDb(url!);
  }, 120_000);

  async function freshCompany(): Promise<string> {
    const [row] = await db.insert(companies).values({ name: `lease-${randomUUID()}`, issuePrefix: `L${randomUUID().slice(0, 5).toUpperCase()}` }).returning({ id: companies.id });
    return row.id;
  }

  it("case 1/2/3/4: two controllers racing on one company yield exactly one owner", async () => {
    const companyId = await freshCompany();
    const svc = controllerLeaseService(db);
    const results = await Promise.all([
      svc.acquireLease({ companyId, controllerId: "A" }),
      svc.acquireLease({ companyId, controllerId: "B" }),
    ]);
    expect(results.filter((r) => r.kind === "HELD")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "HELD_BY_OTHER")).toHaveLength(1);
  });

  it("case 5: an expired lease is taken over with a strictly higher fencing token", async () => {
    const companyId = await freshCompany();
    const svc = controllerLeaseService(db);
    const base = new Date();
    const first = await svc.acquireLease({ companyId, controllerId: "A", leaseTtlMs: 5_000, now: base });
    expect(first.kind).toBe("HELD");
    const later = new Date(base.getTime() + 60_000);
    const takeover = await svc.acquireLease({ companyId, controllerId: "B", now: later });
    expect(takeover.kind).toBe("HELD");
    if (takeover.kind === "HELD") expect(takeover.fencingToken).toBe(2);
  });

  it("case 8/9: a stale controller is rejected after ownership transfers", async () => {
    const companyId = await freshCompany();
    const svc = controllerLeaseService(db);
    const base = new Date();
    await svc.acquireLease({ companyId, controllerId: "A", leaseTtlMs: 5_000, now: base });
    const later = new Date(base.getTime() + 60_000);
    await svc.acquireLease({ companyId, controllerId: "B", now: later });
    // A resumes with stale token 1 after B took ownership. The row's token is
    // now 2, so token 1 matches no row: rejection code is STALE_FENCING_TOKEN.
    // NOT_LEASE_HOLDER is the distinct case where the token exists but a
    // different controller currently owns it.
    const stale = await svc.verifyLease({ companyId, controllerId: "A", fencingToken: 1, now: later });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("STALE_FENCING_TOKEN");
    const wrongHolder = await svc.verifyLease({ companyId, controllerId: "C", fencingToken: 2, now: later });
    expect(wrongHolder.ok).toBe(false);
    if (!wrongHolder.ok) expect(wrongHolder.code).toBe("NOT_LEASE_HOLDER");
    const fresh = await svc.verifyLease({ companyId, controllerId: "B", fencingToken: 2, now: later });
    expect(fresh.ok).toBe(true);
  });

  it("case 7: an expired lease cannot authorize new dispatch", async () => {
    const companyId = await freshCompany();
    const svc = controllerLeaseService(db);
    const base = new Date();
    await svc.acquireLease({ companyId, controllerId: "A", leaseTtlMs: 5_000, now: base });
    const expired = new Date(base.getTime() + 60_000);
    const verify = await svc.verifyLease({ companyId, controllerId: "A", fencingToken: 1, now: expired });
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.code).toBe("LEASE_EXPIRED");
  });

  it("case 6: releasing burns the token so it cannot be replayed", async () => {
    const companyId = await freshCompany();
    const svc = controllerLeaseService(db);
    await svc.acquireLease({ companyId, controllerId: "A", now: new Date() });
    const released = await svc.releaseLease({ companyId, controllerId: "A", fencingToken: 1, reason: "campaign done", now: new Date() });
    expect(released.released).toBe(true);
    const replay = await svc.verifyLease({ companyId, controllerId: "A", fencingToken: 1 });
    expect(replay.ok).toBe(false);
  });

  it("case 10: the API rejects a stale fencing token", async () => {
    const companyId = await freshCompany();
    const svc = controllerLeaseService(db);
    const app = appFor(db, ADMIN);
    const acquired = await request(app).post(`/api/companies/${companyId}/supervisor/lease/acquire`).send({ controllerId: "A", leaseTtlMs: 5_000 });
    expect(acquired.status).toBe(200);
    const token = acquired.body.lease.fencingToken as number;
    const bad = await request(app).post(`/api/companies/${companyId}/supervisor/lease/verify`).send({ controllerId: "ghost", fencingToken: token + 500 });
    expect(bad.status).toBe(403);
    expect(bad.body.code).toBe("STALE_FENCING_TOKEN");
    await svc.releaseLease({ companyId, controllerId: "A", fencingToken: token, reason: "cleanup", now: new Date() });
  });

  it("cleanup: removes test lease rows", async () => {
    // Dedicated scratch database: unconditional deletes are safe and avoid
    // version-dependent column helpers (companies delete cascades to leases).
    await db.delete(controllerLeases);
    await db.delete(companies);
  });
});
