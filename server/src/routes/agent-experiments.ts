import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { kpiAnalyticsService } from "../services/agent-runtime/kpi-analytics.js";
import { assertCompanyAccess } from "./authz.js";

export function agentExperimentRoutes(db: Db) {
  const router = Router();
  const svc = kpiAnalyticsService(db);

  async function getAgentCompanyId(agentId: string): Promise<string | null> {
    const [agent] = await db
      .select({ companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return agent?.companyId ?? null;
  }

  // List experiments for an agent
  router.get("/agents/:agentId/experiments", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const experiments = await svc.listExperiments(agentId);
    
    // Transform experiments to match UI expectations
    const transformedExperiments = experiments.map((exp) => ({
      ...exp,
      name: exp.hypothesis?.substring(0, 50) || `Experiment ${exp.id.substring(0, 8)}`,
      description: exp.changeNotes || exp.approachA?.substring(0, 100) || null,
      result: exp.winningApproach ? `Winner: ${exp.winningApproach}` : null,
    }));
    
    res.json(transformedExperiments);
  });

  // Create experiment
  router.post("/agents/:agentId/experiments", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const { name, description, hypothesis, approachA, approachB, taskType } = req.body;

    if (!hypothesis || !approachA || !approachB) {
      res.status(400).json({ error: "Missing required fields: hypothesis, approachA, approachB" });
      return;
    }

    const experiment = await svc.createExperiment({
      agentId,
      companyId,
      hypothesis,
      approachA,
      approachB,
      taskType,
    });

    // Transform response to match UI expectations
    const transformedExperiment = {
      ...experiment,
      name: name || hypothesis?.substring(0, 50) || `Experiment ${experiment.id.substring(0, 8)}`,
      description: description || approachA?.substring(0, 100) || null,
      result: null,
    };

    res.status(201).json(transformedExperiment);
  });

  // Update experiment (conclude, update runs, etc.)
  router.patch("/agents/:agentId/experiments/:experimentId", async (req, res) => {
    const { agentId, experimentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const { status, winningApproach, runsA, runsB, kpiResultsA, kpiResultsB, changeNotes } = req.body;

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (winningApproach !== undefined) updates.winningApproach = winningApproach;
    if (runsA !== undefined) updates.runsA = runsA;
    if (runsB !== undefined) updates.runsB = runsB;
    if (kpiResultsA !== undefined) updates.kpiResultsA = kpiResultsA;
    if (kpiResultsB !== undefined) updates.kpiResultsB = kpiResultsB;
    if (changeNotes !== undefined) updates.changeNotes = changeNotes;
    if (status === "concluded") updates.concludedAt = new Date();

    const updated = await svc.updateExperiment(experimentId, updates as Parameters<typeof svc.updateExperiment>[1]);

    if (!updated) {
      res.status(404).json({ error: "Experiment not found" });
      return;
    }

    // Transform response to match UI expectations
    const transformedUpdated = {
      ...updated,
      name: updated.hypothesis?.substring(0, 50) || `Experiment ${updated.id.substring(0, 8)}`,
      description: updated.changeNotes || updated.approachA?.substring(0, 100) || null,
      result: updated.winningApproach ? `Winner: ${updated.winningApproach}` : null,
    };

    res.json(transformedUpdated);
  });

  // Delete experiment
  router.delete("/agents/:agentId/experiments/:experimentId", async (req, res) => {
    const { agentId, experimentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const deleted = await svc.deleteExperiment(experimentId);
    if (!deleted) {
      res.status(404).json({ error: "Experiment not found" });
      return;
    }

    res.json({ success: true });
  });

  return router;
}
