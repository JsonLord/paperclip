import { and, eq, gte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvals, documents, issueComments, issueWorkProducts, julesSessions } from "@paperclipai/db";

/**
 * Did this run leave anything behind?
 *
 * A run's exit code says whether the adapter process ended cleanly, and nothing more.
 * An agent that cannot reach the Paperclip API, or that finishes a remote session
 * without opening a pull request, exits 0 — so the board records success, the agent
 * returns to idle, and the outcome it was woken for is untouched. Three separate
 * subsystems were observed doing exactly that, each looking healthy.
 *
 * This does not change whether a run succeeded; a run can legitimately conclude that
 * there is nothing to do. It records whether anything came of it, so that an empty
 * success is visible instead of indistinguishable from a productive one. Only runs
 * dispatched against an issue are assessed: a run with no assigned outcome has nothing
 * it was expected to produce.
 */
export const PRODUCTIVITY_SIGNALS = ["work_product", "comment", "document", "jules_session", "approval"] as const;
export type ProductivitySignal = (typeof PRODUCTIVITY_SIGNALS)[number];

export interface RunProductivity {
  assessed: boolean;
  produced: boolean;
  signals: ProductivitySignal[];
}

export function runProductivityService(db: Db) {
  async function assess(input: {
    companyId: string;
    agentId: string;
    runId: string;
    issueId: string | null;
    startedAt: Date | null;
  }): Promise<RunProductivity> {
    if (!input.issueId) return { assessed: false, produced: false, signals: [] };
    // A run with no recorded start cannot be bounded in time, and counting every comment
    // the agent ever wrote would call an empty run productive. Treat it as unassessable.
    if (!input.startedAt) return { assessed: false, produced: false, signals: [] };
    const since = input.startedAt;
    const signals: ProductivitySignal[] = [];

    const any = async (rows: Promise<unknown[]>) => (await rows).length > 0;

    if (await any(db.select().from(issueWorkProducts)
      .where(and(eq(issueWorkProducts.companyId, input.companyId), eq(issueWorkProducts.createdByRunId, input.runId))).limit(1))) {
      signals.push("work_product");
    }
    if (await any(db.select().from(issueComments)
      .where(and(eq(issueComments.companyId, input.companyId), eq(issueComments.issueId, input.issueId), eq(issueComments.authorAgentId, input.agentId), gte(issueComments.createdAt, since))).limit(1))) {
      signals.push("comment");
    }
    if (await any(db.select().from(documents)
      .where(and(eq(documents.companyId, input.companyId), eq(documents.updatedByAgentId, input.agentId), gte(documents.updatedAt, since))).limit(1))) {
      signals.push("document");
    }
    // A dispatch that created a remote session has handed the work on rather than
    // dropped it: the session is the artifact at this point, and the reconciler judges
    // what it produces.
    if (await any(db.select().from(julesSessions)
      .where(and(eq(julesSessions.companyId, input.companyId), eq(julesSessions.paperclipRunId, input.runId))).limit(1))) {
      signals.push("jules_session");
    }
    if (await any(db.select().from(approvals)
      .where(and(eq(approvals.companyId, input.companyId), eq(approvals.requestedByAgentId, input.agentId), gte(approvals.createdAt, since))).limit(1))) {
      signals.push("approval");
    }

    return { assessed: true, produced: signals.length > 0, signals };
  }

  return { assess };
}
