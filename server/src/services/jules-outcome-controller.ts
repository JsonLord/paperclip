import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog, issues, julesManagerDecisions, julesSessions } from "@paperclipai/db";
import type { DeterministicValidationInput, DeterministicValidationResult } from "./founderos-validation/types.js";
import { founderOsValidationService } from "./founderos-validation/index.js";
import type { FounderManagerProvider, ResultJudgeInput, ResultJudgment } from "./founder-manager/index.js";
import { founderManagerService } from "./founder-manager/index.js";

export interface OutcomeControllerDependencies {
  manager: FounderManagerProvider;
  buildJudgeInput(input: DeterministicValidationInput, validation: DeterministicValidationResult): Promise<ResultJudgeInput>;
  sendRevision(session: typeof julesSessions.$inferSelect, message: string): Promise<void>;
  /** Must create a new native run and route it through julesCapacityBroker before remote creation. */
  scheduleBrokeredRetry(session: typeof julesSessions.$inferSelect, reason: string, retryNumber: number): Promise<{ runId: string; sessionId?: string }>;
  maxSameSessionRevisions?: number;
  maxFreshRetries?: number;
}
function revisionMessage(judgment: ResultJudgment, validation: DeterministicValidationResult, writeScope: string[]) {
  const defects = [...validation.failed.map((f) => `${f.code}${f.path ? ` (${f.path})` : ""}: ${f.message}`), ...judgment.revisionInstructions];
  return ["Correct only the defects below in this same session.", ...defects.map((x) => `- ${x}`), `Permitted write scope: ${writeScope.join(", ") || "none"}.`, "Preserve files not implicated by these findings. Submit a new completion candidate after correction."].join("\n");
}
export function enforceAttemptLimits(verdict: ResultJudgment["verdict"], revisionCount: number, retryNumber: number, maxRevisions = 2, maxRetries = 1) {
  if (verdict === "REVISE_SAME_SESSION" && revisionCount >= maxRevisions) return "ESCALATE" as const;
  if (verdict === "RETRY_NEW_SESSION" && retryNumber >= maxRetries) return "ESCALATE" as const;
  return verdict;
}
export function julesOutcomeController(db: Db, deps: OutcomeControllerDependencies) {
  const validator = founderOsValidationService(db); const manager = founderManagerService(deps.manager);
  const maxRevisions = deps.maxSameSessionRevisions ?? 2; const maxRetries = deps.maxFreshRetries ?? 1;
  async function activity(session: typeof julesSessions.$inferSelect, action: string, details: Record<string, unknown>) { await db.insert(activityLog).values({ companyId: session.companyId, actorType: "system", actorId: "founderos-outcome-controller", agentId: session.agentId, runId: session.paperclipRunId, action, entityType: session.issueId ? "issue" : "jules_session", entityId: session.issueId ?? session.id, details }); }
  async function apply(session: typeof julesSessions.$inferSelect, validationRow: any, input: DeterministicValidationInput, judgment: ResultJudgment) {
    const [decision] = await db.insert(julesManagerDecisions).values({ companyId: session.companyId, sessionId: session.id, validationId: validationRow.id, paperclipRunId: session.paperclipRunId, verdict: judgment.verdict, confidence: Math.round(judgment.confidence * 100), reason: judgment.reason, passedCriteria: judgment.passedCriteria, failedCriteria: judgment.failedCriteria, revisionInstructions: judgment.revisionInstructions, requiresHuman: judgment.requiresHuman, recommendedWaitCondition: judgment.recommendedWaitCondition, recommendedNextAction: judgment.recommendedNextAction, provider: manager.provider, model: manager.model }).onConflictDoNothing().returning();
    if (!decision) return { duplicate: true, verdict: judgment.verdict };
    if (judgment.verdict === "ACCEPT") {
      if (judgment.requiresHuman) throw new Error("ACCEPT cannot be applied while human approval is required");
      await db.update(julesSessions).set({ status: "ACCEPTED", completionCandidate: false, updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
      if (session.issueId) await db.update(issues).set({ status: "done", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(issues.id, session.issueId), eq(issues.companyId, session.companyId)));
      await activity(session, "jules.outcome.accepted", { validationId: validationRow.id, decisionId: decision.id, commit: input.commitSha, autoMerge: false });
    } else if (judgment.verdict === "REVISE_SAME_SESSION") {
      if (session.revisionCount >= maxRevisions) return applyExhausted(session, validationRow.id, "Same-session revision budget exhausted");
      await deps.sendRevision(session, revisionMessage(judgment, validationRow.resultJson as DeterministicValidationResult, input.writeScope));
      await db.update(julesSessions).set({ status: "REVISION_REQUESTED", completionCandidate: false, revisionCount: session.revisionCount + 1, updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
      await activity(session, "jules.revision.requested", { validationId: validationRow.id, decisionId: decision.id, revisionCount: session.revisionCount + 1 });
    } else if (judgment.verdict === "RETRY_NEW_SESSION") {
      if (session.retryNumber >= maxRetries) return applyExhausted(session, validationRow.id, "Fresh retry budget exhausted");
      const retry = await deps.scheduleBrokeredRetry(session, judgment.reason, session.retryNumber + 1);
      await activity(session, "jules.retry.scheduled", { validationId: validationRow.id, decisionId: decision.id, retryRunId: retry.runId, retrySessionId: retry.sessionId, retryNumber: session.retryNumber + 1, brokerRequired: true });
    } else if (judgment.verdict === "WAIT") {
      await db.update(julesSessions).set({ status: "PAUSED", waitReason: judgment.reason, waitCondition: judgment.recommendedWaitCondition ?? null, updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
      if (session.issueId) await db.update(issues).set({ status: "blocked", updatedAt: new Date() }).where(and(eq(issues.id, session.issueId), eq(issues.companyId, session.companyId)));
      await activity(session, "jules.outcome.waiting", { reason: judgment.reason, wakeCondition: judgment.recommendedWaitCondition });
    } else if (judgment.verdict === "ESCALATE" || judgment.verdict === "FAIL_OUTCOME") {
      await db.update(julesSessions).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
      if (session.issueId) await db.update(issues).set({ status: "blocked", updatedAt: new Date() }).where(and(eq(issues.id, session.issueId), eq(issues.companyId, session.companyId)));
      await activity(session, judgment.verdict === "ESCALATE" ? "jules.outcome.escalated" : "jules.outcome.failed", { reason: judgment.reason, failedCriteria: judgment.failedCriteria, requiresHuman: judgment.requiresHuman, infrastructureFailure: false });
    }
    return { duplicate: false, verdict: judgment.verdict };
  }
  async function applyExhausted(session: typeof julesSessions.$inferSelect, validationId: string, reason: string) { await db.update(julesSessions).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(julesSessions.id, session.id)); await activity(session, "jules.outcome.escalated", { validationId, reason, requiresHuman: true }); return { duplicate: false, verdict: "ESCALATE" as const }; }
  async function evaluate(sessionId: string, input: DeterministicValidationInput) {
    const session = await db.select().from(julesSessions).where(eq(julesSessions.id, sessionId)).limit(1).then((r) => r[0]); if (!session) throw new Error("Jules session not found");
    if (session.companyId !== input.companyId || session.paperclipRunId !== input.paperclipRunId || session.julesSessionId !== input.julesSessionId || session.agentId !== input.agentId || session.issueId !== (input.issueId ?? null)) throw new Error("Validation input contradicts native Jules session binding");
    await db.update(julesSessions).set({ status: "VALIDATING", updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
    const result = validator.validate(input); const row = await validator.persist(input, result, session.id);
    if (result.hardFailure) { await db.update(julesSessions).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(julesSessions.id, session.id)); await activity(session, "jules.validation.hard_failure", { validationId: row.id, failed: result.failed.map((f) => ({ code: f.code, path: f.path })), secretsRedacted: true }); return { validation: result, verdict: "ESCALATE" as const, managerCalled: false }; }
    if (result.status === "BLOCKED") { await db.update(julesSessions).set({ status: "PAUSED", waitReason: "Deterministic validation is blocked", waitCondition: result.failed.map((f) => f.message).join("; "), updatedAt: new Date() }).where(eq(julesSessions.id, session.id)); return { validation: result, verdict: "WAIT" as const, managerCalled: false }; }
    await db.update(julesSessions).set({ status: "AWAITING_MANAGER_JUDGMENT", updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
    const judgeInput = await deps.buildJudgeInput(input, result); const judgment = await manager.resultJudge(judgeInput); return { validation: result, ...(await apply(session, row, input, judgment)), managerCalled: true };
  }
  return { evaluate };
}
