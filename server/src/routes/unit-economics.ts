import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { unitEconomicsService } from "../services/unit-economics.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

export function unitEconomicsRoutes(db: Db) {
  const router = Router(), service = unitEconomicsService(db);
  const run = (handler: (companyId: string, body: Record<string, unknown>) => Promise<unknown>) => async (req: any, res: any) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await handler(companyId, req.body)); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Unit-economics request invalid" }); } };
  router.post("/companies/:companyId/unit-economics/activate", run((companyId, body) => service.activate({ ...body, companyId } as Parameters<typeof service.activate>[0])));
  router.post("/companies/:companyId/unit-economics/models", run((companyId, body) => service.createModel(companyId, body as unknown as Parameters<typeof service.createModel>[1])));
  router.post("/companies/:companyId/unit-economics/models/:modelId/inputs", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.addInput(companyId, req.params.modelId as string, req.body)); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Economic input invalid" }); } });
  router.post("/companies/:companyId/unit-economics/models/:modelId/assumptions", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.status(201).json(await service.addAssumption(companyId, req.params.modelId as string, req.body)); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Assumption invalid" }); } });
  router.post("/companies/:companyId/unit-economics/models/:modelId/analyze", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.json(await service.analyze(companyId, req.params.modelId as string, req.body.scenarios ?? [])); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Analysis invalid" }); } });
  router.get("/companies/:companyId/unit-economics/models/:modelId/customer-costs", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.json(await service.importCustomerCosts(companyId, req.params.modelId as string)); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Cost import invalid" }); } });
  router.get("/companies/:companyId/unit-economics/models/:modelId/verified-revenue", async (req, res) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); try { res.json(await service.importVerifiedRevenue(companyId, req.params.modelId as string)); } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Revenue import invalid" }); } });
  return router;
}
