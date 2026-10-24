import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HttpError } from "../errors.js";
import { fakeDb } from "./fixtures/fake-db.js";
import { supervisorRoutes } from "../routes/supervisor.js";

// Local contract coverage for WP3 routes that do not touch the wake path:
// auth, tenancy, validation, lease gating, and pagination shape. The genuine
// idempotency/state-machine proofs run against real PostgreSQL in
// dispatch-ledger.pg.test.ts (NOT_RUN without DATABASE_URL).

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
    // Mirrors the documented API contract: payload validation failures map to 400.
    const isZod = (err as { name?: string })?.name === "ZodError" || Array.isArray((err as { issues?: unknown[] })?.issues);
    const status = isZod ? 400 : err instanceof HttpError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  });
  return app;
}

describe("supervisor dispatch routes (local contract)", () => {
  it("lists intents with pagination shape", async () => {
    const { db } = fakeDb();
    const app = appFor(db, ADMIN);
    const res = await request(app).get("/api/companies/company-a/supervisor/dispatch-intents");
    expect(res.status).toBe(200);
    expect(res.body.intents).toEqual([]);
    expect(res.body.nextOffset).toBeNull();
  });

  it("rejects an unknown state filter", async () => {
    const { db } = fakeDb();
    const app = appFor(db, ADMIN);
    const res = await request(app).get("/api/companies/company-a/supervisor/dispatch-intents?state=BOGUS");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_STATE_FILTER");
  });

  it("enforces board access and company tenancy", async () => {
    const anon = appFor(fakeDb().db, { type: "none", source: "none" });
    expect((await request(anon).get("/api/companies/company-a/supervisor/dispatch-intents")).status).toBe(403);
    const other = appFor(fakeDb().db, { type: "agent", agentId: "a1", companyId: "company-b" });
    expect((await request(other).get("/api/companies/company-a/supervisor/dispatch-intents")).status).toBe(403);
  });

  it("validates the activation payload", async () => {
    const { db } = fakeDb();
    const app = appFor(db, ADMIN);
    const res = await request(app).post("/api/companies/company-a/supervisor/dispatch")
      .send({ agentId: "agent-1", activationKey: "short", controllerId: "A", fencingToken: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects dispatch when the caller lease is stale", async () => {
    const { db } = fakeDb();
    const app = appFor(db, ADMIN);
    const res = await request(app).post("/api/companies/company-a/supervisor/dispatch")
      .send({ agentId: "agent-1", activationKey: "activation-key-1", controllerId: "A", fencingToken: 7 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("LEASE_REJECTED");
    expect(res.body.code).toBe("STALE_FENCING_TOKEN");
  });
});
