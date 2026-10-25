import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { crowdfundingService } from "../services/crowdfunding.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

export function crowdfundingRoutes(db: Db) {
  const router = Router(), service = crowdfundingService(db);
  const run = (handler: (companyId: string, body: any, params: any) => Promise<unknown>, status = 201) => async (req: any, res: any) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(status).json(await handler(companyId, req.body, req.params)); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Invalid crowdfunding request" }); } };
  router.post("/companies/:companyId/crowdfunding/activate", run((companyId, body) => service.activate({ ...body, companyId })));
  router.post("/companies/:companyId/crowdfunding/campaigns", run((companyId, body) => service.compile(companyId, { ...body, compiledAt: body.compiledAt ?? new Date().toISOString() })));
  router.post("/companies/:companyId/crowdfunding/campaigns/:campaignId/launch", run((companyId, body, params) => service.launch(companyId, params.campaignId, body.approvalId), 202));
  router.post("/companies/:companyId/crowdfunding/events", run((companyId, body) => service.ingest(companyId, { ...body, occurredAt: new Date(body.occurredAt) })));
  router.post("/companies/:companyId/crowdfunding/campaigns/:campaignId/wait", run((companyId, body, params) => service.wait(companyId, params.campaignId, body.issueId)));
  return router;
}
