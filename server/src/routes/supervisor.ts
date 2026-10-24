import { Router, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { julesSessions } from "@paperclipai/db";
import {
  acquireControllerLeaseSchema,
  activateDispatchSchema,
  reconcileDispatchSchema,
  releaseControllerLeaseSchema,
  verifyControllerLeaseSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { controllerLeaseService } from "../services/controller-lease.js";
import { dispatchLedgerService, type DispatchState } from "../services/dispatch-ledger.js";
import { heartbeatService } from "../services/heartbeat.js";

const ACTIVE_JULES_STATES = ["QUEUED", "IN_PROGRESS", "COMPLETED_UNVALIDATED", "WAITING"];

type Handler = (req: Request, res: Response) => Promise<void>;

// Async handlers forward thrown errors (including HttpError from assert*) to the
// error handler through next(), so an unauthorized/forbidden guard yields its
// proper status instead of an unhandled rejection.
function run(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function parsePaging(req: Request) {
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset };
}

export function supervisorRoutes(db: Db) {
  const router = Router();
  const leases = controllerLeaseService(db);
  const ledger = dispatchLedgerService(db);
  const heartbeat = heartbeatService(db);

  // Read-only: the current controller lease for a company. Any board observer can see
  // who owns dispatch authority and the fencing token without creating or changing state.
  router.get("/companies/:companyId/supervisor/lease", run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    res.json({ lease: await leases.getLease(companyId) });
  }));

  // Mutating: acquire or renew the company controller lease. Exactly one controller can
  // hold it; a live lease held by another controller yields 409 and is never silently stolen.
  router.post("/companies/:companyId/supervisor/lease/acquire", validate(acquireControllerLeaseSchema), run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const result = await leases.acquireLease({ companyId, controllerId: req.body.controllerId, leaseTtlMs: req.body.leaseTtlMs });
    if (result.kind === "HELD") {
      res.status(200).json({ status: "HELD", lease: await leases.getLease(companyId) });
      return;
    }
    if (result.kind === "HELD_BY_OTHER") {
      res.status(409).json({ error: "LEASE_HELD_BY_OTHER", holderControllerId: result.controllerId, fencingToken: result.fencingToken, leaseExpiresAt: result.leaseExpiresAt });
      return;
    }
    res.status(409).json({ error: "NO_LEASE_ROW_AFTER_ACQUIRE" });
  }));

  // Verify a fencing token for a guarded dispatch. Read-only with respect to lease state.
  router.post("/companies/:companyId/supervisor/lease/verify", validate(verifyControllerLeaseSchema), run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const result = await leases.verifyLease({ companyId, controllerId: req.body.controllerId, fencingToken: req.body.fencingToken });
    if (result.ok) {
      res.status(200).json({ authorized: true, fencingToken: result.fencingToken });
      return;
    }
    res.status(403).json({ authorized: false, code: result.code });
  }));

  // Mutating: release the caller's own current lease (fences out its own token).
  router.post("/companies/:companyId/supervisor/lease/release", validate(releaseControllerLeaseSchema), run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const result = await leases.releaseLease({ companyId, controllerId: req.body.controllerId, fencingToken: req.body.fencingToken, reason: req.body.reason });
    if (!result.released) {
      res.status(409).json({ error: "LEASE_NOT_HELD_BY_CALLER" });
      return;
    }
    res.status(200).json({ released: true, fencingToken: result.fencingToken });
  }));

  // Read-only, company-scoped Jules session list. Closes the supervisor observability
  // gap: remote session status/terminality can be inspected without waking anything.
  // Pagination uses a fetch of offset+limit+1 then slices, which is correct in Postgres
  // and does not depend on an OFFSET clause.
  router.get("/companies/:companyId/jules/sessions", run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const { limit, offset } = parsePaging(req);
    const statusFilter = typeof req.query.status === "string" && req.query.status.length > 0 ? req.query.status : null;
    const base = [eq(julesSessions.companyId, companyId)];
    if (statusFilter === "active") base.push(inArray(julesSessions.status, ACTIVE_JULES_STATES));
    else if (statusFilter) base.push(eq(julesSessions.status, statusFilter));
    const rows = await db
      .select()
      .from(julesSessions)
      .where(and(...base))
      .orderBy(desc(julesSessions.startedAt))
      .limit(offset + limit + 1);
    const page = rows.slice(offset);
    const hasMore = page.length > limit;
    const sessions = page.slice(0, limit).map((row) => ({
      id: row.id,
      agentId: row.agentId,
      issueId: row.issueId,
      paperclipRunId: row.paperclipRunId,
      julesSessionId: row.julesSessionId,
      status: row.status,
      completionCandidate: row.completionCandidate,
      pullRequestUrl: row.pullRequestUrl,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    }));
    res.json({ sessions, nextOffset: hasMore ? offset + sessions.length : null });
  }));


  // Idempotent campaign dispatch (WP3). Lease-verified, ledger-recorded, and
  // replay-safe: re-sending the same activationKey never wakes the agent again.
  router.post("/companies/:companyId/supervisor/dispatch", validate(activateDispatchSchema), run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const lease = await leases.verifyLease({ companyId, controllerId: req.body.controllerId, fencingToken: req.body.fencingToken });
    if (!lease.ok) {
      res.status(403).json({ error: "LEASE_REJECTED", code: lease.code });
      return;
    }
    const unknowns = await ledger.listIntents({ companyId, state: "UNKNOWN", limit: 100 });
    if (unknowns.rows.some((row) => row.agentId === req.body.agentId)) {
      res.status(409).json({ error: "UNKNOWN_RECONCILIATION_REQUIRED", message: "a prior dispatch for this agent has an unresolved outcome" });
      return;
    }
    const recorded = await ledger.recordIntent({
      companyId,
      agentId: req.body.agentId,
      issueId: req.body.issueId ?? null,
      activationKey: req.body.activationKey,
      fencingToken: req.body.fencingToken,
      controllerId: req.body.controllerId,
    });
    if (recorded.kind === "REPLAY") {
      res.status(200).json({ replayed: true, intent: recorded.intent });
      return;
    }
    try {
      const wakeRun = await heartbeat.wakeup(req.body.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: `activation:${req.body.activationKey}`,
        payload: null,
        idempotencyKey: req.body.activationKey,
        requestedByActorType: "user",
        requestedByActorId: req.actor.userId ?? null,
        contextSnapshot: { triggeredBy: "supervisor", activationKey: req.body.activationKey },
      });
      if (!wakeRun) {
        const failed = await ledger.transition({ id: recorded.intent.id, fromState: "INTENT", toState: "FAILED", errorCode: "WAKE_SKIPPED" });
        res.status(202).json({ status: "skipped", intent: failed });
        return;
      }
      const dispatched = await ledger.transition({ id: recorded.intent.id, fromState: "INTENT", toState: "DISPATCHED", runId: wakeRun.id });
      res.status(200).json({ status: "dispatched", intent: dispatched });
    } catch (err) {
      const unknown = await ledger.transition({
        id: recorded.intent.id,
        fromState: "INTENT",
        toState: "UNKNOWN",
        errorCode: err instanceof Error ? err.name : "WAKE_ERROR",
        detail: { message: err instanceof Error ? String(err.message).slice(0, 300) : "unknown error" },
      });
      res.status(502).json({ error: "WAKE_OUTCOME_UNKNOWN", intent: unknown });
    }
  }));

  // Reconcile a dispatch by activation key. UNKNOWN is only resolvable by an
  // explicit confirmation that no provider session exists.
  router.post("/companies/:companyId/supervisor/dispatch/reconcile", validate(reconcileDispatchSchema), run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const lease = await leases.verifyLease({ companyId, controllerId: req.body.controllerId, fencingToken: req.body.fencingToken });
    if (!lease.ok) {
      res.status(403).json({ error: "LEASE_REJECTED", code: lease.code });
      return;
    }
    const intent = await ledger.getByKey(req.body.activationKey);
    if (!intent || intent.companyId !== companyId) {
      res.status(404).json({ error: "DISPATCH_INTENT_NOT_FOUND" });
      return;
    }
    if (intent.state === "CONFIRMED" || intent.state === "FAILED") {
      res.status(200).json({ already: intent.state, intent });
      return;
    }
    let updated = null;
    if (intent.state === "UNKNOWN") {
      if (req.body.outcome === "pre_allocation_failure" && req.body.noSessionConfirmed === true) {
        updated = await ledger.transition({ id: intent.id, fromState: "UNKNOWN", toState: "FAILED", errorCode: req.body.errorCode ?? "NO_SESSION_CONFIRMED", externalSessionId: null });
      }
      if (!updated) {
        res.status(409).json({ error: "UNKNOWN_STILL_BLOCKED", message: "confirm no provider session exists before resolving this dispatch" });
        return;
      }
    } else if (req.body.outcome === "confirmed") {
      if (!req.body.runId) {
        res.status(422).json({ error: "RUN_ID_REQUIRED" });
        return;
      }
      updated = await ledger.transition({ id: intent.id, fromState: "DISPATCHED", toState: "CONFIRMED", runId: req.body.runId, externalSessionId: req.body.externalSessionId ?? null });
    } else if (req.body.outcome === "pre_allocation_failure") {
      if (!req.body.errorCode) {
        res.status(422).json({ error: "ERROR_CODE_REQUIRED" });
        return;
      }
      updated = await ledger.transition({ id: intent.id, fromState: "DISPATCHED", toState: "FAILED", errorCode: req.body.errorCode, externalSessionId: null });
    } else {
      updated = await ledger.transition({ id: intent.id, fromState: "DISPATCHED", toState: "UNKNOWN", errorCode: req.body.errorCode ?? null });
    }
    if (!updated) {
      res.status(409).json({ error: "DISPATCH_CAS_CONFLICT" });
      return;
    }
    res.status(200).json({ intent: updated });
  }));

  // Read-only dispatch ledger listing with pagination and optional state filter.
  router.get("/companies/:companyId/supervisor/dispatch-intents", run(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const { limit, offset } = parsePaging(req);
    const stateParam = typeof req.query.state === "string" && req.query.state.length > 0 ? req.query.state : null;
    const allowed = ["INTENT", "DISPATCHED", "CONFIRMED", "FAILED", "UNKNOWN"];
    if (stateParam && !allowed.includes(stateParam)) {
      res.status(400).json({ error: "INVALID_STATE_FILTER" });
      return;
    }
    const page = await ledger.listIntents({ companyId, state: stateParam as DispatchState | undefined, limit, offset });
    res.json({ intents: page.rows, nextOffset: page.nextOffset });
  }));

  return router;
}
