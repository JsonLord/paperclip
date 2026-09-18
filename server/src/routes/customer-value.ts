import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { customerValueService } from "../services/customer-value.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

export function customerValueRoutes(db: Db) {
  const router = Router(), service = customerValueService(db);
  const company = (req: { params: Record<string, string | string[]> }) => req.params.companyId as string;
  const fail = (res: { status(code: number): { json(value: unknown): unknown } }, error: unknown) => res.status(422).json({ error: error instanceof Error ? error.message : "Customer-value request invalid" });
  router.post("/companies/:companyId/customer-value/activate", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.activate({ ...req.body, companyId })); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/product-events", async (req, res) => { const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.ingestUsage(companyId, { ...req.body, occurredAt: new Date(req.body.occurredAt) })); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/activation-definitions", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.defineActivation(companyId, { ...req.body, effectiveAt: new Date(req.body.effectiveAt) })); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/value-hypotheses", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.defineValueHypothesis(companyId, req.body)); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/customer-outcomes", async (req, res) => { const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.recordOutcome(companyId, { ...req.body, observedAt: new Date(req.body.observedAt) })); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/retention-windows", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.openRetentionWindow(companyId, { ...req.body, startAt: new Date(req.body.startAt), endAt: new Date(req.body.endAt) })); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/retention/wait", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.waitForRetention(companyId, req.body.issueId, req.body.windowId)); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/retention/expire", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.json(await service.expireRetentionWindows(companyId, req.body.now ? new Date(req.body.now) : new Date())); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/retention-events", async (req, res) => { const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.recordRetention(companyId, { ...req.body, occurredAt: new Date(req.body.occurredAt) })); } catch (error) { fail(res, error); } });
  router.post("/companies/:companyId/cost-observations", async (req, res) => { assertBoard(req); const companyId = company(req); assertCompanyAccess(req, companyId); try { res.status(201).json(await service.recordCost(companyId, { ...req.body, periodStart: new Date(req.body.periodStart), periodEnd: new Date(req.body.periodEnd) })); } catch (error) { fail(res, error); } });
  return router;
}
