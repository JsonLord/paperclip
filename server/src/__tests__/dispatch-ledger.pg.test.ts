import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { applyPendingMigrations, companies, createDb, dispatchIntents, type Db } from "@paperclipai/db";
import { dispatchLedgerService } from "../services/dispatch-ledger.js";

// Real PostgreSQL proofs for WP3 idempotent dispatch, with deterministic fixtures
// from the October 24 incident. Gated on DATABASE_URL; skipped (NOT_RUN) without it.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("dispatch ledger idempotency (real PostgreSQL)", () => {
  let db: Db;
  let svc: ReturnType<typeof dispatchLedgerService>;
  let companyId: string;

  beforeAll(async () => {
    await applyPendingMigrations(url!);
    db = createDb(url!);
    svc = dispatchLedgerService(db);
    const [row] = await db.insert(companies).values({ name: `ledger-${randomUUID()}`, issuePrefix: `D${randomUUID().slice(0, 5).toUpperCase()}` }).returning({ id: companies.id });
    companyId = row.id;
  }, 120_000);

  it("oct-24 fixture: pre-allocation failure FAILED, replay returns stored state, no second wake", async () => {
    const agentId = randomUUID();
    const key = `oct24-${randomUUID()}`;
    const rec = await svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 1, controllerId: "controller-A" });
    expect(rec.kind).toBe("NEW");
    const dispatched = await svc.transition({ id: rec.intent.id, fromState: "INTENT", toState: "DISPATCHED", runId: randomUUID() });
    expect(dispatched?.state).toBe("DISPATCHED");
    // Run b88080ab/2242cf7d: instant fail, sessionIdBefore/After null -> no session allocated.
    const failed = await svc.transition({ id: rec.intent.id, fromState: "DISPATCHED", toState: "FAILED", errorCode: "jules_auth_required", externalSessionId: null });
    expect(failed?.state).toBe("FAILED");
    expect(failed?.completedAt).toBeTruthy();
    // Replay after "lost response": must return the stored record, never re-dispatch.
    const replay = await svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 2, controllerId: "controller-B" });
    expect(replay.kind).toBe("REPLAY");
    expect(replay.intent.state).toBe("FAILED");
    expect(replay.intent.fencingToken).toBe(1); // original recording wins
  });

  it("duplicate concurrent activations for one key produce exactly one NEW intent", async () => {
    const agentId = randomUUID();
    const key = `dup-${randomUUID()}`;
    const results = await Promise.all([
      svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 1, controllerId: "A" }),
      svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 1, controllerId: "B" }),
      svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 1, controllerId: "C" }),
    ]);
    expect(results.filter((r) => r.kind === "NEW")).toHaveLength(1);
    const rows = await db.select().from(dispatchIntents).where(eq(dispatchIntents.activationKey, key));
    expect(rows).toHaveLength(1);
  });

  it("UNKNOWN blocks silently-overwritable states: CAS rejects wrong fromState, explicit no-session resolve works", async () => {
    const agentId = randomUUID();
    const key = `unk-${randomUUID()}`;
    const rec = await svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 1, controllerId: "A" });
    const unk = await svc.transition({ id: rec.intent.id, fromState: "INTENT", toState: "UNKNOWN", errorCode: "TimeoutError" });
    expect(unk?.state).toBe("UNKNOWN");
    // A racing reconciler must not be able to jump UNKNOWN->CONFIRMED (wrong fromState CAS).
    const bad = await svc.transition({ id: rec.intent.id, fromState: "DISPATCHED", toState: "CONFIRMED", runId: randomUUID() });
    expect(bad).toBeNull();
    // Only the guarded UNKNOWN->FAILED resolution (no-session confirmed) unblocks.
    const resolved = await svc.transition({ id: rec.intent.id, fromState: "UNKNOWN", toState: "FAILED", errorCode: "NO_SESSION_CONFIRMED", externalSessionId: null });
    expect(resolved?.state).toBe("FAILED");
  });

  it("confirm path records the external session id and completes once", async () => {
    const agentId = randomUUID();
    const key = `ok-${randomUUID()}`;
    const rec = await svc.recordIntent({ companyId, agentId, activationKey: key, fencingToken: 1, controllerId: "A" });
    await svc.transition({ id: rec.intent.id, fromState: "INTENT", toState: "DISPATCHED", runId: randomUUID() });
    const done = await svc.transition({ id: rec.intent.id, fromState: "DISPATCHED", toState: "CONFIRMED", externalSessionId: "jules-session-123" });
    expect(done?.state).toBe("CONFIRMED");
    expect(done?.externalSessionId).toBe("jules-session-123");
    expect(done?.completedAt).toBeTruthy();
    // Terminal states are frozen: no further transitions.
    const again = await svc.transition({ id: rec.intent.id, fromState: "CONFIRMED", toState: "FAILED", errorCode: "late" });
    expect(again).toBeNull();
  });

  it("cleanup: removes test rows", async () => {
    await db.delete(dispatchIntents);
    await db.delete(companies);
  });
});
