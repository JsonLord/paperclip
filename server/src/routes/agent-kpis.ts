import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { postRunEvalService } from "../services/agent-runtime/post-run-eval.js";
import { kpiAnalyticsService } from "../services/agent-runtime/kpi-analytics.js";
import { assertCompanyAccess } from "./authz.js";

export function agentKpiRoutes(db: Db) {
  const router = Router();
  const postRun = postRunEvalService(db);
  const analytics = kpiAnalyticsService(db);

  async function getAgentCompanyId(agentId: string): Promise<string | null> {
    const [agent] = await db
      .select({ companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return agent?.companyId ?? null;
  }

  // List KPIs for an agent
  router.get("/agents/:agentId/kpis", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const projectId = req.query.projectId as string | undefined;

    const kpis = await postRun.getAgentKpis(agentId, { from, to, projectId });
    
    // Transform KPIs to match UI expectations
    const transformedKpis = kpis.map((kpi) => ({
      ...kpi,
      completionRate: kpi.taskCompleted != null ? (kpi.taskCompleted ? 1 : 0) : null,
      durationMs: kpi.durationSeconds != null ? kpi.durationSeconds * 1000 : null,
      errorCount: kpi.errorsEncountered,
    }));
    
    res.json(transformedKpis);
  });

  // Get trend data for an agent
  router.get("/agents/:agentId/kpis/trends", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const windowSize = req.query.windowSize ? parseInt(req.query.windowSize as string, 10) : 10;
    const trends = await postRun.getAgentTrends(agentId, windowSize);
    res.json(trends);
  });

  // Company-wide analytics
  router.get("/companies/:companyId/analytics", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const result = await analytics.getCompanyAnalytics(companyId);
    res.json(result);
  });

  // List observations
  router.get("/companies/:companyId/analytics/observations", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const observations = await analytics.listObservations(companyId);
    
    // Transform observations to match UI expectations
    const transformedObservations = observations.map((obs) => ({
      ...obs,
      agentId: obs.agentIds && obs.agentIds.length > 0 ? obs.agentIds[0] : null,
      title: `Observation from ${new Date(obs.createdAt).toLocaleDateString()}`,
      content: obs.observation,
      severity: "info" as const,
    }));
    
    res.json(transformedObservations);
  });

  // Create observation
  router.post("/companies/:companyId/analytics/observations", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const { agentId, title, content, severity, observerType, observerAgentId, observerUserId, agentIds, actionTaken, actionNotes } = req.body;

    // Map UI fields to backend fields
    const observationText = content || title || "No observation text";
    const obsObserverType = observerType || "ceo_agent";
    // Convert single agentId to array if provided
    const finalAgentIds = agentId ? [agentId] : (agentIds || []);
    
    const result = await analytics.createObservation({
      companyId,
      observerType: obsObserverType,
      observerAgentId,
      observerUserId,
      observation: observationText,
      agentIds: finalAgentIds,
      actionTaken,
      actionNotes,
    });

    // Transform response to match UI expectations
    const transformedResult = {
      ...result,
      agentId: result.agentIds && result.agentIds.length > 0 ? result.agentIds[0] : null,
      title: title || `Observation from ${new Date(result.createdAt).toLocaleDateString()}`,
      content: content || observationText,
      severity: severity || "info",
    };
    
    res.status(201).json(transformedResult);
  });

  // Delete observation
  router.delete("/companies/:companyId/analytics/observations/:id", async (req, res) => {
    const { companyId, id } = req.params;
    assertCompanyAccess(req, companyId);

    const deleted = await analytics.deleteObservation(id);
    if (!deleted) {
      res.status(404).json({ error: "Observation not found" });
      return;
    }

    res.json({ success: true });
  });

  return router;
}
