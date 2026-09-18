import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { businessModelCanvasService } from "../services/business-model-canvas.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

export function businessModelCanvasRoutes(db: Db) {
  const router = Router(), service = businessModelCanvasService(db);
  router.post("/companies/:companyId/business-model/activate", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.activate({ ...req.body, companyId })); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "BMC activation invalid" }); } });
  router.post("/companies/:companyId/business-model/compile", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.compile({ ...req.body, companyId, compiledAt: new Date(req.body.compiledAt ?? Date.now()) })); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "BMC compilation invalid" }); } });
  router.get("/companies/:companyId/business-model/staleness", async (req, res) => { const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); res.json(await service.unresolvedStaleness(companyId)); });
  return router;
}
