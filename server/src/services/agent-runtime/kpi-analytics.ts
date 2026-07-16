import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentKpis,
  agentKpiObservations,
  agentExperiments,
  agents,
} from "@paperclipai/db";

export function kpiAnalyticsService(db: Db) {
  return {
    async getCompanyAnalytics(companyId: string) {
      // Get all agents in the company
      const companyAgents = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      const agentSummaries = [];

      for (const agent of companyAgents) {
        const kpis = await db
          .select()
          .from(agentKpis)
          .where(eq(agentKpis.agentId, agent.id))
          .orderBy(desc(agentKpis.createdAt))
          .limit(20);

        if (kpis.length === 0) {
          agentSummaries.push({
            agentId: agent.id,
            agentName: agent.name,
            totalRuns: 0,
            completionRate: null,
            avgSelfAssessment: null,
            avgCostCents: null,
            totalCostCents: 0,
            avgDurationSeconds: null,
            avgErrors: null,
          });
          continue;
        }

        const withCompletion = kpis.filter((k) => k.taskCompleted != null);
        const completionRate =
          withCompletion.length > 0
            ? withCompletion.filter((k) => k.taskCompleted).length / withCompletion.length
            : null;

        const avgOf = (getter: (k: (typeof kpis)[0]) => number | null | undefined) => {
          const vals = kpis.map(getter).filter((v): v is number => v != null);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };

        const totalCost = kpis.reduce((sum, k) => sum + (k.costCents ?? 0), 0);

        agentSummaries.push({
          agentId: agent.id,
          agentName: agent.name,
          totalRuns: kpis.length,
          completionRate,
          avgSelfAssessment: avgOf((k) => k.selfAssessmentScore),
          avgCostCents: avgOf((k) => k.costCents),
          totalCostCents: totalCost,
          avgDurationSeconds: avgOf((k) => k.durationSeconds),
          avgErrors: avgOf((k) => k.errorsEncountered),
        });
      }

      return {
        companyId,
        agentCount: companyAgents.length,
        agents: agentSummaries,
        agentTrends: agentSummaries.map((a) => ({
          agentId: a.agentId,
          agentName: a.agentName,
          completionRate: a.completionRate,
          avgCostCents: a.avgCostCents,
          avgDurationSeconds: a.avgDurationSeconds,
          totalRuns: a.totalRuns,
        })),
      };
    },

    async createObservation(data: {
      companyId: string;
      observerType: "ceo_agent" | "board_human";
      observerAgentId?: string | null;
      observerUserId?: string | null;
      observation: string;
      agentIds?: string[];
      actionTaken?: boolean;
      actionNotes?: string | null;
    }) {
      const [obs] = await db
        .insert(agentKpiObservations)
        .values({
          companyId: data.companyId,
          observerType: data.observerType,
          observerAgentId: data.observerAgentId ?? null,
          observerUserId: data.observerUserId ?? null,
          observation: data.observation,
          agentIds: data.agentIds ?? [],
          actionTaken: data.actionTaken ?? false,
          actionNotes: data.actionNotes ?? null,
        })
        .returning();

      return obs;
    },

    async listObservations(companyId: string) {
      return db
        .select()
        .from(agentKpiObservations)
        .where(eq(agentKpiObservations.companyId, companyId))
        .orderBy(desc(agentKpiObservations.createdAt));
    },

    async deleteObservation(id: string) {
      const [deleted] = await db
        .delete(agentKpiObservations)
        .where(eq(agentKpiObservations.id, id))
        .returning();

      return deleted;
    },

    async listExperiments(agentId: string) {
      return db
        .select()
        .from(agentExperiments)
        .where(eq(agentExperiments.agentId, agentId))
        .orderBy(desc(agentExperiments.createdAt));
    },

    async createExperiment(data: {
      agentId: string;
      companyId: string;
      hypothesis: string;
      approachA: string;
      approachB: string;
      taskType?: string | null;
    }) {
      const [experiment] = await db
        .insert(agentExperiments)
        .values({
          agentId: data.agentId,
          companyId: data.companyId,
          hypothesis: data.hypothesis,
          approachA: data.approachA,
          approachB: data.approachB,
          taskType: data.taskType ?? null,
          status: "running",
        })
        .returning();

      return experiment;
    },

    async updateExperiment(
      experimentId: string,
      data: {
        status?: "running" | "concluded";
        winningApproach?: string | null;
        runsA?: number;
        runsB?: number;
        kpiResultsA?: Record<string, unknown>;
        kpiResultsB?: Record<string, unknown>;
        changeNotes?: string | null;
        concludedAt?: Date | null;
      },
    ) {
      const [updated] = await db
        .update(agentExperiments)
        .set(data)
        .where(eq(agentExperiments.id, experimentId))
        .returning();

      return updated;
    },

    async deleteExperiment(experimentId: string) {
      const [deleted] = await db
        .delete(agentExperiments)
        .where(eq(agentExperiments.id, experimentId))
        .returning();

      return deleted;
    },
  };
}
