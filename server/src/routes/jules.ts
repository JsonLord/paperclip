import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyJulesSources, heartbeatRuns, julesProfileSources, julesProfiles, julesSessions } from "@paperclipai/db";
import { bindJulesSourceSchema, createJulesProfileSchema, julesCallbackSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { requestJulesReconciliation } from "../services/jules-reconciler.js";
import { assertCapabilityBinding, julesCallbackService, type JulesCallbackEventType } from "../services/jules-callbacks.js";
import { issueJulesRunCapability, JULES_RUN_OPERATIONS, verifyJulesRunCapability, type JulesRunOperation } from "../services/jules-run-capability.js";

const operationByType: Record<JulesCallbackEventType, JulesRunOperation> = {
  progress: "report_progress", blocker: "report_blocker", artifact: "report_artifact",
  proposal: "propose_workstream", approval: "request_approval", complete: "submit_completion_candidate",
};

function bearer(req: Request): string {
  const value = req.header("authorization") ?? "";
  if (!value.startsWith("Bearer ")) throw new Error("Jules run capability bearer token required");
  return value.slice(7).trim();
}

export function julesRoutes(db: Db) {
  const router = Router();
  const callbacks = julesCallbackService(db, { onCompletionCandidate: () => requestJulesReconciliation() });
  router.get("/jules/profiles", async (req, res) => { assertBoard(req); res.json(await db.select().from(julesProfiles)); });
  router.post("/jules/profiles", validate(createJulesProfileSchema), async (req, res) => {
    assertBoard(req);
    const [created] = await db.insert(julesProfiles).values(req.body).returning();
    res.status(201).json(created);
  });
  router.get("/companies/:companyId/jules-sources", async (req, res) => {
    const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId);
    res.json(await db.select().from(companyJulesSources).where(eq(companyJulesSources.companyId, companyId)));
  });
  router.post("/companies/:companyId/jules-sources", validate(bindJulesSourceSchema), async (req, res) => {
    assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId);
    const [source] = await db.insert(companyJulesSources).values({ companyId, repository: req.body.repository, source: req.body.source, startingBranch: req.body.startingBranch, requiredCapabilities: req.body.requiredCapabilities }).returning();
    if (req.body.profileIds.length) await db.insert(julesProfileSources).values(req.body.profileIds.map((profileId: string) => ({ profileId, companySourceId: source.id })));
    await logActivity(db, { companyId, actorType: "user", actorId: req.actor.userId ?? "board", action: "jules.source.bound", entityType: "company_jules_source", entityId: source.id, details: { repository: source.repository, source: source.source } });
    res.status(201).json(source);
  });

  router.post("/jules/v1/runs/:runId/capability", async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;
    const session = await callbacks.getSessionByRun(runId);
    if (!session) return void res.status(404).json({ error: "Unknown Jules run" });
    assertCompanyAccess(req, session.companyId);
    const requested = Array.isArray(req.body?.allowedOperations) ? req.body.allowedOperations.filter((value: unknown): value is JulesRunOperation => JULES_RUN_OPERATIONS.includes(value as JulesRunOperation)) : [...JULES_RUN_OPERATIONS];
    const ttlSec = Math.min(3600, Math.max(60, Number(req.body?.ttlSec ?? 3600)));
    const token = issueJulesRunCapability({ companyId: session.companyId, paperclipRunId: session.paperclipRunId, julesSessionId: session.julesSessionId, agentId: session.agentId, goalId: session.goalId, projectId: session.projectId, issueId: session.issueId, outcomeId: session.outcomeId, allowedOperations: requested, version: session.capabilityVersion }, ttlSec);
    res.status(201).json({ token, tokenType: "Bearer", expiresIn: ttlSec, environmentVariable: "PAPERCLIP_RUN_TOKEN" });
  });
  router.post("/jules/v1/runs/:runId/capability/revoke", async (req, res) => {
    assertBoard(req);
    const session = await callbacks.getSessionByRun(req.params.runId as string);
    if (!session) return void res.status(404).json({ error: "Unknown Jules run" });
    assertCompanyAccess(req, session.companyId);
    const [updated] = await db.update(julesSessions).set({ capabilityVersion: session.capabilityVersion + 1, updatedAt: new Date() }).where(eq(julesSessions.id, session.id)).returning();
    res.json({ revoked: true, capabilityVersion: updated.capabilityVersion });
  });

  async function authorize(req: Request, operation: JulesRunOperation) {
    const runId = req.params.runId as string;
    const session = await callbacks.getSessionByRun(runId);
    if (!session) throw new Error("Unknown Jules run");
    const claims = verifyJulesRunCapability(bearer(req), operation);
    assertCapabilityBinding(claims, session, operation, req.body ?? {});
    const [run] = await db.select({ status: heartbeatRuns.status }).from(heartbeatRuns).where(eq(heartbeatRuns.id, runId)).limit(1);
    if (!run || ["cancelled"].includes(run.status)) throw new Error("Paperclip run is closed");
    return { session, claims };
  }

  for (const type of ["progress", "blocker", "artifact", "proposal", "approval", "complete"] as const) {
    const path = type === "blocker" ? "blockers" : type === "artifact" ? "artifacts" : type === "proposal" ? "proposals" : type === "approval" ? "approvals" : type;
    router.post(`/jules/v1/runs/:runId/${path}`, validate(julesCallbackSchema), async (req, res) => {
      try {
        const { session } = await authorize(req, operationByType[type]);
        const result = await callbacks.promote(session, type, req.body as Record<string, unknown>);
        res.status(result.applied ? 202 : 200).json({ ...result, completionCandidate: type === "complete" });
      } catch (error) {
        res.status(403).json({ error: error instanceof Error ? error.message : "Forbidden" });
      }
    });
  }
  router.get("/jules/v1/runs/:runId/context", async (req, res) => {
    try {
      const { session, claims } = await authorize(req, "read_run_context");
      res.json(await callbacks.getContext(session, claims.allowedOperations));
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : "Forbidden" });
    }
  });
  return router;
}
