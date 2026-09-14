import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { installResourcePackSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { goalSupportService } from "../services/goal-support.js";
import { logActivity } from "../services/activity-log.js";

export function goalSupportRoutes(db: Db) {
  const router = Router();
  const service = goalSupportService(db);
  router.get("/companies/:companyId/resource-packs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await service.list(companyId));
  });
  router.post("/companies/:companyId/resource-packs", validate(installResourcePackSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const snapshot = await service.install(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "resource_pack.installed", entityType: "resource_pack_snapshot", entityId: snapshot.id, details: { packId: snapshot.packId, version: snapshot.version, sourceRepo: snapshot.sourceRepo, sourceCommit: snapshot.sourceCommit } });
    res.status(201).json(snapshot);
  });
  router.get("/goals/:goalId/support", async (req, res) => {
    const result = await service.resolve(req.params.goalId as string);
    if (!result) return void res.status(404).json({ error: "Goal not found" });
    assertCompanyAccess(req, result.companyId);
    res.json(result.resolution);
  });
  return router;
}
