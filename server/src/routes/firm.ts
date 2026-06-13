import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { firmService } from "../services/firm.js";
import { assertCompanyAccess, assertBoard } from "./authz.js";

export function firmRoutes(db: Db) {
  const router = Router();
  const svc = firmService(db);

  // GET /api/companies/:companyId/firm — latest snapshot status
  router.get("/:companyId/firm", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const snapshot = await svc.getLatestSnapshot(companyId);
    if (!snapshot) {
      res.status(404).json({ error: "No firm snapshot found" });
      return;
    }
    res.json({
      id: snapshot.id,
      companyId: snapshot.companyId,
      sourceRepo: snapshot.sourceRepo,
      commitSha: snapshot.commitSha,
      isLatest: snapshot.isLatest,
      fetchedAt: snapshot.fetchedAt,
      createdAt: snapshot.createdAt,
    });
  });

  // POST /api/companies/:companyId/firm/refresh — manual refresh trigger
  router.post("/:companyId/firm/refresh", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    // Fire-and-forget
    void svc.refreshFirm(companyId);
    res.json({ ok: true, message: "Firm refresh enqueued" });
  });

  return router;
}
