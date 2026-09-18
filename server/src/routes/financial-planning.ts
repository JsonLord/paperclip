import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { financialPlanningService } from "../services/financial-planning.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
export function financialPlanningRoutes(db: Db) { const router = Router(), service = financialPlanningService(db);
  router.post("/companies/:companyId/financial-planning/activate", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.activate({ ...req.body, companyId })); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Financial planning activation invalid" }); } });
  router.post("/companies/:companyId/financial-planning/compile", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.compile({ ...req.body, companyId, compiledAt: new Date(req.body.compiledAt ?? Date.now()) }, req.body.scenarios ?? [])); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Financial plan invalid" }); } });
  return router;
}
