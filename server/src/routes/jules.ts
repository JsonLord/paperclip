import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyJulesSources, julesCallbackEvents, julesProfileSources, julesProfiles, julesSessions } from "@paperclipai/db";
import { bindJulesSourceSchema, createJulesProfileSchema, julesCallbackSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity } from "../services/activity-log.js";

export function julesRoutes(db: Db) {
  const router = Router();
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

  const callback = (eventType: string) => async (req: Request, res: Response) => {
    const runId = req.params.runId as string;
    const [session] = await db.select().from(julesSessions).where(eq(julesSessions.paperclipRunId, runId)).limit(1);
    if (!session) return void res.status(404).json({ error: "Unknown Jules run" });
    assertCompanyAccess(req, session.companyId);
    const payload = req.body as Record<string, unknown>;
    const inserted = await db.insert(julesCallbackEvents).values({ companyId: session.companyId, sessionId: session.id, eventId: String(payload.eventId), eventType, payload }).onConflictDoNothing().returning();
    if (inserted.length && eventType === "complete") await db.update(julesSessions).set({ completionCandidate: true, status: "completed", resultJson: payload, updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
    res.status(inserted.length ? 202 : 200).json({ accepted: Boolean(inserted.length), duplicate: !inserted.length, completionCandidate: eventType === "complete" });
  };
  for (const event of ["progress", "blockers", "artifacts", "proposals", "complete"]) router.post(`/jules/v1/runs/:runId/${event}`, validate(julesCallbackSchema), callback(event));
  router.get("/jules/v1/runs/:runId/context", async (req, res) => {
    const runId = req.params.runId as string;
    const rows = await db.select({ session: julesSessions, source: companyJulesSources }).from(julesSessions).innerJoin(companyJulesSources, eq(julesSessions.companySourceId, companyJulesSources.id)).where(eq(julesSessions.paperclipRunId, runId)).limit(1);
    if (!rows[0]) return void res.status(404).json({ error: "Unknown Jules run" });
    assertCompanyAccess(req, rows[0].session.companyId);
    res.json({ runId, companyId: rows[0].session.companyId, repository: rows[0].source.repository, source: rows[0].source.source, outcomeId: rows[0].session.outcomeId, permissions: { paperclipWrite: ["progress", "blockers", "artifacts", "proposals", "completion_candidate"], externalActions: "approval_required" } });
  });
  return router;
}
