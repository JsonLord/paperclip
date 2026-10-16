import { and, desc, eq } from "drizzle-orm";
import {
  agents,
  approvals,
  companies,
  costEvents,
  goals,
  issues,
  issueComments,
  nodepadBindings,
  validationRecords,
  type Db,
} from "@paperclipai/db";
import { validationProgrammeService } from "./programmes.js";
import { documentService } from "../documents.js";

/** Stable ordering and per-surface bounds: model memory is never the source of authority. */
export async function assembleCeoContext(
  db: Db,
  companyId: string,
  now = new Date(),
) {
  const svc = validationProgrammeService(db),
    p = await svc.get(companyId);
  if (!p) return null;
  const companyBudget = await db
    .select({
      monthBudgetCents: companies.budgetMonthlyCents,
      spentMonthlyCents: companies.spentMonthlyCents,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((r) => r[0]);
  const [
    vision,
    comments,
    statement,
    work,
    pending,
    costs,
    roster,
    binding,
    records,
  ] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.id, p.visionGoalId), eq(goals.companyId, companyId)))
      .then((r) => r[0]),
    db
      .select()
      .from(issueComments)
      .where(
        and(
          eq(issueComments.companyId, companyId),
          eq(issueComments.issueId, p.directionIssueId),
        ),
      )
      .orderBy(desc(issueComments.createdAt), desc(issueComments.id))
      .limit(6),
    documentService(db).getIssueDocumentByKey(
      p.directionIssueId,
      "founder-statement",
    ),
    db
      .select({ id: issues.id, title: issues.title, status: issues.status })
      .from(issues)
      .where(eq(issues.companyId, companyId))
      .orderBy(desc(issues.updatedAt), desc(issues.id))
      .limit(20),
    db
      .select({ id: approvals.id, type: approvals.type })
      .from(approvals)
      .where(
        and(
          eq(approvals.companyId, companyId),
          eq(approvals.status, "pending"),
        ),
      )
      .orderBy(desc(approvals.createdAt))
      .limit(10),
    db
      .select({ id: costEvents.id, cents: costEvents.costCents })
      .from(costEvents)
      .where(eq(costEvents.companyId, companyId))
      .orderBy(desc(costEvents.occurredAt))
      .limit(10),
    db
      .select({
        id: agents.id,
        runtime: agents.adapterType,
        status: agents.status,
      })
      .from(agents)
      .where(eq(agents.companyId, companyId))
      .limit(20),
    db
      .select()
      .from(nodepadBindings)
      .where(eq(nodepadBindings.companyId, companyId))
      .then((r) => r[0]),
    db
      .select()
      .from(validationRecords)
      .where(eq(validationRecords.companyId, companyId))
      .orderBy(desc(validationRecords.createdAt), desc(validationRecords.id))
      .limit(20),
  ]);
  const summary = await svc.summary(companyId, now);
  const packet = {
    version: "validation-ceo-context/v1",
    companyId,
    logicalManagerId: p.ceoAgentId,
    assembledAt: now.toISOString(),
    vision: {
      id: vision?.id,
      title: vision?.title,
      description: vision?.description?.slice(0, 2000),
      constraints: p.founderConstraints,
    },
    founder: {
      directionIssueId: p.directionIssueId,
      statement: statement
        ? {
            id: statement.id,
            revision: statement.latestRevisionId,
            body: statement.body?.slice(0, 5000),
          }
        : null,
      replies: comments.map((c) => ({
        id: c.id,
        authorUserId: c.authorUserId,
        body: c.body.slice(0, 1200),
      })),
    },
    programme: {
      phase: p.phase,
      clock: summary.clock,
      policy: p.policy,
      diagnostics: summary.diagnostics,
      adaptations: summary.adaptations.slice(0, 5),
    },
    nodepad: binding?.snapshot
      ? {
          authority: "Nodepad > Firm",
          revision: binding.snapshot.revision,
          capturedAt: binding.snapshot.capturedAt,
          hypotheses: binding.snapshot.hypotheses
            .filter((h) => h.primary || h.priority)
            .slice(0, 10),
          contradictions: binding.snapshot.contradictions.slice(0, 8),
          gaps: binding.snapshot.researchGaps.slice(0, 8),
          experiments: binding.snapshot.experiments.slice(0, 8),
          movement: binding.snapshot.materialChanges.slice(0, 8),
        }
      : { status: "READY_CONFIG" },
    paperclip: {
      work,
      budget: companyBudget,
      approvals: pending,
      recentCosts: costs,
      runtimeCapacity: roster,
    },
    decisions: records
      .filter((r) => ["decision", "decision_request"].includes(r.kind))
      .slice(0, 8),
    reporter: summary.latestReporter,
    latestCycle: summary.latestCycle,
    nextActions: summary.nextActions.slice(0, 3),
    instruction:
      "Review prior decisions and programme drift. Stop low-value work. Persist a management cycle with at most three must-win outcomes and three founder questions. Founder statements are strategy, never evidence. Never dispatch product/backend engineering. Nodepad qualification is read-only.",
  };
  // Deterministic bounded serialization preserves JSON validity, traceability and priority surfaces.
  const encoded = JSON.stringify(packet);
  if (encoded.length <= 48_000) return packet;
  const fallback = {
    ...packet,
    programme: { ...packet.programme, diagnostics: null, adaptations: [] },
    nodepad: {
      status: "DEGRADED",
      reason: "Context projection exceeds bound; fetch company-scoped details",
      revision: binding?.snapshot?.revision,
    },
    decisions: records
      .filter((r) => r.kind === "decision_request")
      .slice(0, 3)
      .map((r) => ({ id: r.id, status: r.status })),
    reporter: null,
  };
  function bound(value: unknown): unknown {
    if (typeof value === "string") return value.slice(0, 500);
    if (Array.isArray(value)) return value.slice(0, 5).map(bound);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [key, bound(v)]),
      );
    return value;
  }
  const compact = bound(fallback) as typeof fallback;
  if (JSON.stringify(compact).length <= 48_000) return compact;
  return {
    version: packet.version,
    companyId,
    logicalManagerId: p.ceoAgentId,
    assembledAt: now.toISOString(),
    directionIssueId: p.directionIssueId,
    visionGoalId: p.visionGoalId,
    phase: p.phase,
    warning:
      "CONTEXT_BOUND_EXCEEDED: fetch the company-scoped programme/decision/document APIs",
    instruction: packet.instruction,
  };
}
