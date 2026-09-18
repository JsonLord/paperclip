import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { businessPlanService } from "../services/business-plan.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
export function businessPlanRoutes(db: Db) { const router = Router(), service = businessPlanService(db);
  router.post("/companies/:companyId/business-plan/activate", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.activate({ ...req.body, companyId })); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Business plan activation invalid" }); } });
  router.post("/companies/:companyId/business-plan/compile", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.compile({ ...req.body, companyId, compiledAt: new Date(req.body.compiledAt ?? Date.now()) })); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Business plan invalid" }); } });
  return router;
}
