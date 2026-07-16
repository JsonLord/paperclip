import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentKpis } from "@paperclipai/db";

export function postRunEvalService(db: Db) {
  return {
    async recordKpis(data: {
      agentId: string;
      companyId: string;
      projectId?: string | null;
      runId?: string | null;
      taskCompleted?: boolean | null;
      selfAssessmentScore?: number | null;
      tokensUsed?: number | null;
      costCents?: number | null;
      durationSeconds?: number | null;
      errorsEncountered?: number;
      metadata?: Record<string, unknown>;
    }) {
      const [kpi] = await db
        .insert(agentKpis)
        .values({
          agentId: data.agentId,
          companyId: data.companyId,
          projectId: data.projectId ?? null,
          runId: data.runId ?? null,
          taskCompleted: data.taskCompleted ?? null,
          selfAssessmentScore: data.selfAssessmentScore ?? null,
          tokensUsed: data.tokensUsed ?? null,
          costCents: data.costCents ?? null,
          durationSeconds: data.durationSeconds ?? null,
          errorsEncountered: data.errorsEncountered ?? 0,
          metadata: data.metadata ?? {},
        })
        .returning();

      return kpi;
    },

    async getAgentKpis(
      agentId: string,
      opts?: { from?: Date; to?: Date; projectId?: string },
    ) {
      const conditions = [eq(agentKpis.agentId, agentId)];

      if (opts?.from) {
        conditions.push(gte(agentKpis.createdAt, opts.from));
      }
      if (opts?.to) {
        conditions.push(lte(agentKpis.createdAt, opts.to));
      }
      if (opts?.projectId) {
        conditions.push(eq(agentKpis.projectId, opts.projectId));
      }

      return db
        .select()
        .from(agentKpis)
        .where(and(...conditions))
        .orderBy(desc(agentKpis.createdAt));
    },

    async getAgentTrends(agentId: string, windowSize: number = 10) {
      // Get recent KPIs
      const kpis = await db
        .select()
        .from(agentKpis)
        .where(eq(agentKpis.agentId, agentId))
        .orderBy(desc(agentKpis.createdAt))
        .limit(windowSize * 2);

      if (kpis.length === 0) {
        return {
          completionRate: null,
          avgSelfAssessment: null,
          avgTokensUsed: null,
          avgCostCents: null,
          avgDurationSeconds: null,
          avgErrors: null,
          recentWindow: [],
          previousWindow: [],
        };
      }

      const recent = kpis.slice(0, Math.min(windowSize, kpis.length));
      const previous = kpis.slice(windowSize, windowSize * 2);

      function avg(items: typeof kpis, getter: (k: (typeof kpis)[0]) => number | null | undefined): number | null {
        const values = items.map(getter).filter((v): v is number => v != null);
        if (values.length === 0) return null;
        return values.reduce((a, b) => a + b, 0) / values.length;
      }

      function rate(items: typeof kpis): number | null {
        const withValue = items.filter((k) => k.taskCompleted != null);
        if (withValue.length === 0) return null;
        return withValue.filter((k) => k.taskCompleted).length / withValue.length;
      }

      return {
        completionRate: rate(recent),
        avgSelfAssessment: avg(recent, (k) => k.selfAssessmentScore),
        avgTokensUsed: avg(recent, (k) => k.tokensUsed),
        avgCostCents: avg(recent, (k) => k.costCents),
        avgDurationSeconds: avg(recent, (k) => k.durationSeconds),
        avgErrors: avg(recent, (k) => k.errorsEncountered),
        recentWindow: recent,
        previousWindow: previous,
        trends: {
          completionRate: computeTrend(rate(recent), rate(previous)),
          avgSelfAssessment: computeTrend(
            avg(recent, (k) => k.selfAssessmentScore),
            avg(previous, (k) => k.selfAssessmentScore),
          ),
          avgCostCents: computeTrend(
            avg(recent, (k) => k.costCents),
            avg(previous, (k) => k.costCents),
          ),
        },
      };
    },
  };
}

function computeTrend(
  current: number | null,
  previous: number | null,
): { direction: "up" | "down" | "flat" | "unknown"; delta: number | null } {
  if (current == null || previous == null) return { direction: "unknown", delta: null };
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return { direction: "flat", delta };
  return { direction: delta > 0 ? "up" : "down", delta };
}
