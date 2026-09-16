import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog, agents, approvals, companies, companyJulesSources, goals, heartbeatRuns,
  issueApprovals, issueComments, issues, issueWorkProducts, julesCallbackEvents,
  julesRepositoryLeases, julesSessions, projects,
} from "@paperclipai/db";
import { goalSupportService } from "./goal-support.js";
import { isJulesCapabilityWritable, type JulesRunOperation, type JulesRunCapabilityClaims } from "./jules-run-capability.js";

export type JulesCallbackEventType = "progress" | "blocker" | "artifact" | "proposal" | "approval" | "complete";
export interface JulesCallbackPromotionHooks {
  onMeaningfulProgress?(event: PromotionEvent): void | Promise<void>;
  onBlockerReported?(event: PromotionEvent): void | Promise<void>;
  onApprovalRequested?(event: PromotionEvent): void | Promise<void>;
  onArtifactReported?(event: PromotionEvent): void | Promise<void>;
  onWorkstreamProposed?(event: PromotionEvent): void | Promise<void>;
  onCompletionCandidate?(event: PromotionEvent): void | Promise<void>;
}
export interface PromotionEvent { eventId: string; type: JulesCallbackEventType; sessionId: string; companyId: string; runId: string; issueId: string | null }

const hookByType: Record<JulesCallbackEventType, keyof JulesCallbackPromotionHooks> = {
  progress: "onMeaningfulProgress", blocker: "onBlockerReported", artifact: "onArtifactReported",
  proposal: "onWorkstreamProposed", approval: "onApprovalRequested", complete: "onCompletionCandidate",
};

function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function meaningfulProgress(summary: string) { return summary.length >= 24 && !/^(ran|executed|called|used)\s+\d*\s*(commands?|tools?)/i.test(summary); }

export function assertCapabilityBinding(
  claims: JulesRunCapabilityClaims,
  session: typeof julesSessions.$inferSelect,
  operation: JulesRunOperation,
  payload: Record<string, unknown> = {},
) {
  if (!claims.allowedOperations.includes(operation)) throw new Error(`Operation ${operation} is not allowed`);
  if (claims.companyId !== session.companyId || claims.paperclipRunId !== session.paperclipRunId || claims.julesSessionId !== session.julesSessionId || claims.agentId !== session.agentId || claims.version !== session.capabilityVersion) throw new Error("Jules capability does not match persisted run binding");
  if (claims.goalId !== session.goalId || claims.projectId !== session.projectId || claims.issueId !== session.issueId || claims.outcomeId !== session.outcomeId) throw new Error("Jules capability organizational binding is stale");
  for (const [key, expected] of [["companyId", session.companyId], ["runId", session.paperclipRunId], ["sessionId", session.julesSessionId], ["agentId", session.agentId], ["goalId", session.goalId], ["projectId", session.projectId], ["issueId", session.issueId]] as const) {
    if (payload[key] != null && payload[key] !== expected) throw new Error(`Callback ${key} contradicts authenticated run binding`);
  }
  if (operation !== "read_run_context" && !isJulesCapabilityWritable(session.status as never)) throw new Error("Jules session capability is no longer writable");
}

export function julesCallbackService(db: Db, hooks: JulesCallbackPromotionHooks = {}) {
  async function getSessionByRun(runId: string) {
    return db.select().from(julesSessions).where(eq(julesSessions.paperclipRunId, runId)).limit(1).then((rows) => rows[0] ?? null);
  }

  async function promote(session: typeof julesSessions.$inferSelect, type: JulesCallbackEventType, payload: Record<string, unknown>) {
    const eventId = text(payload.eventId);
    if (!eventId) throw new Error("eventId is required");
    if (type === "approval" && ["approved", "rejected"].includes(String(payload.status).toLowerCase())) throw new Error("Jules cannot resolve or self-approve an approval request");
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const inserted = await tx.insert(julesCallbackEvents).values({ companyId: session.companyId, sessionId: session.id, eventId, eventType: type, payload }).onConflictDoNothing().returning();
      if (!inserted[0]) return { applied: false, duplicate: true };
      const activity = async (action: string, details: Record<string, unknown>) => tx.insert(activityLog).values({ companyId: session.companyId, actorType: "agent", actorId: session.agentId, agentId: session.agentId, runId: session.paperclipRunId, action, entityType: session.issueId ? "issue" : "jules_session", entityId: session.issueId ?? session.id, details });

      if (type === "progress") {
        const summary = text(payload.summary) ?? "";
        if (meaningfulProgress(summary)) await activity("jules.progress.reported", { eventId, summary, sessionId: session.julesSessionId });
      } else if (type === "blocker") {
        const description = text(payload.description) ?? text(payload.summary) ?? "Jules reported a blocker";
        if (session.issueId) {
          await tx.update(issues).set({ status: "blocked", updatedAt: now }).where(and(eq(issues.id, session.issueId), eq(issues.companyId, session.companyId)));
          await tx.insert(issueComments).values({ companyId: session.companyId, issueId: session.issueId, authorAgentId: session.agentId, body: `Blocker: ${description}` });
        }
        await activity("jules.blocker.reported", { eventId, description, severity: text(payload.severity) ?? "medium", requiresHuman: payload.requiresHuman === true, requiresApproval: payload.requiresApproval === true, externalDependency: payload.externalDependency === true, sessionId: session.julesSessionId });
      } else if (type === "artifact") {
        if (!session.issueId) throw new Error("Artifact callback requires a bound native issue");
        const path = text(payload.path) ?? text(payload.githubPath);
        const title = text(payload.title) ?? path ?? "Jules artifact";
        const externalId = text(payload.commitSha) ? `${text(payload.commitSha)}:${path ?? eventId}` : eventId;
        const [source] = await tx.select().from(companyJulesSources).where(eq(companyJulesSources.id, session.companySourceId)).limit(1);
        const branch = text(payload.branch) ?? source?.startingBranch ?? "main";
        const url = text(payload.url) ?? (path && source ? `https://github.com/${source.repository}/blob/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}` : null);
        await tx.insert(issueWorkProducts).values({ companyId: session.companyId, projectId: session.projectId, issueId: session.issueId, type: text(payload.type) ?? "artifact", provider: "github", externalId, title, url, status: "candidate", reviewState: "pending", summary: text(payload.summary), createdByRunId: session.paperclipRunId, metadata: { eventId, path, repository: source?.repository, branch, commitSha: text(payload.commitSha), prUrl: text(payload.prUrl), sessionId: session.julesSessionId, provenanceIds: payload.provenanceIds, resourcePackVersions: payload.resourcePackVersions, createdByAgentId: session.agentId } });
        await activity("jules.artifact.reported", { eventId, title, path, url, sessionId: session.julesSessionId });
      } else if (type === "approval") {
        const [approval] = await tx.insert(approvals).values({ companyId: session.companyId, type: "external_action", requestedByAgentId: session.agentId, status: "pending", payload: { ...payload, eventId, runId: session.paperclipRunId, sessionId: session.julesSessionId, goalId: session.goalId, projectId: session.projectId, issueId: session.issueId } }).returning();
        if (session.issueId) await tx.insert(issueApprovals).values({ companyId: session.companyId, issueId: session.issueId, approvalId: approval.id, linkedByAgentId: session.agentId }).onConflictDoNothing();
        await activity("jules.approval.requested", { eventId, approvalId: approval.id, actionType: text(payload.actionType) ?? "other" });
      } else if (type === "proposal") {
        await activity("jules.workstream.proposed", { eventId, proposalType: text(payload.proposalType) ?? "workstream", title: text(payload.title), summary: text(payload.summary), requiresAcceptance: true, sessionId: session.julesSessionId });
      } else if (type === "complete") {
        const submitted = record(payload.pullRequest);
        await tx.update(julesSessions).set({ status: "COMPLETED_UNVALIDATED", completionCandidate: true, pullRequestUrl: text(submitted.url) ?? text(payload.pullRequestUrl) ?? session.pullRequestUrl, pullRequestTitle: text(submitted.title) ?? session.pullRequestTitle, pullRequestDescription: text(submitted.description) ?? session.pullRequestDescription, resultJson: payload, finishedAt: session.finishedAt ?? now, updatedAt: now }).where(and(eq(julesSessions.id, session.id), eq(julesSessions.companyId, session.companyId)));
        await activity("jules.completion_candidate.submitted", { eventId, sessionId: session.julesSessionId, issueId: session.issueId });
      }
      return { applied: true, duplicate: false };
    });
    if (result.applied) await hooks[hookByType[type]]?.({ eventId, type, sessionId: session.id, companyId: session.companyId, runId: session.paperclipRunId, issueId: session.issueId });
    return result;
  }

  async function getContext(session: typeof julesSessions.$inferSelect, allowedOperations = JULES_RUN_OPERATIONS_SAFE) {
    const [run, company, agent, goal, project, issue, source, currentApprovals, workProducts, blockers, lease] = await Promise.all([
      db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, session.paperclipRunId)).limit(1).then((r) => r[0] ?? null),
      db.select().from(companies).where(eq(companies.id, session.companyId)).limit(1).then((r) => r[0] ?? null),
      db.select().from(agents).where(eq(agents.id, session.agentId)).limit(1).then((r) => r[0] ?? null),
      session.goalId ? db.select().from(goals).where(eq(goals.id, session.goalId)).limit(1).then((r) => r[0] ?? null) : null,
      session.projectId ? db.select().from(projects).where(eq(projects.id, session.projectId)).limit(1).then((r) => r[0] ?? null) : null,
      session.issueId ? db.select().from(issues).where(eq(issues.id, session.issueId)).limit(1).then((r) => r[0] ?? null) : null,
      db.select().from(companyJulesSources).where(eq(companyJulesSources.id, session.companySourceId)).limit(1).then((r) => r[0] ?? null),
      db.select().from(approvals).where(eq(approvals.companyId, session.companyId)),
      session.issueId ? db.select().from(issueWorkProducts).where(and(eq(issueWorkProducts.companyId, session.companyId), eq(issueWorkProducts.issueId, session.issueId))) : [],
      db.select().from(julesCallbackEvents).where(and(eq(julesCallbackEvents.sessionId, session.id), eq(julesCallbackEvents.eventType, "blocker"))),
      db.select().from(julesRepositoryLeases).where(eq(julesRepositoryLeases.sessionId, session.id)).limit(1).then((r) => r[0] ?? null),
    ]);
    const support = session.goalId ? await goalSupportService(db).resolve(session.goalId) : null;
    const snapshot = record(run?.contextSnapshot);
    return {
      run: run && { id: run.id, status: run.status },
      company: company && { id: company.id, name: company.name, description: company.description },
      agent: agent && { id: agent.id, name: agent.name, role: agent.role, title: agent.title },
      goal: goal && { id: goal.id, title: goal.title, level: goal.level, parentId: goal.parentId, description: goal.description },
      project: project && { id: project.id, name: project.name, description: project.description, status: project.status },
      issue: issue && { id: issue.id, identifier: issue.identifier, title: issue.title, description: issue.description, status: issue.status, priority: issue.priority },
      objective: text(snapshot.objective) ?? issue?.description ?? goal?.description ?? issue?.title ?? goal?.title ?? null,
      inputs: support?.resolution.inputPaths ?? [], requiredOutputs: support?.resolution.outputPaths ?? [], acceptanceCriteria: support?.resolution.acceptanceCriteria ?? [], cannotCompleteIf: support?.resolution.cannotCompleteIf ?? [], requiredSkills: support?.resolution.skills ?? [],
      resolvedSupportPacks: (support?.resolution.packs ?? []).map((pack) => ({ id: pack.id, version: pack.version, installedPath: pack.installedPath, sourceCommit: pack.sourceCommit, required: goal?.supportPacks.find((item) => item.id === pack.id)?.required !== false, qualityGates: pack.qualityGates })),
      requiredCapabilities: support?.resolution.capabilities ?? [], writeScope: lease?.writeScopes ?? (Array.isArray(snapshot.writeScopes) ? snapshot.writeScopes : []), externalActionPolicy: text(snapshot.externalActionPolicy) ?? "APPROVAL_REQUIRED",
      linear: record(snapshot.linear), currentApprovals: currentApprovals.filter((item) => record(item.payload).runId === session.paperclipRunId), relevantWorkProducts: workProducts, currentBlockers: blockers.map((item) => item.payload), managerNotes: text(snapshot.managerNotes),
      repository: source && { name: source.repository, source: source.source, branch: source.startingBranch, baseRef: text(snapshot.baseRef) },
      authoritativeBinding: { companyId: session.companyId, runId: session.paperclipRunId, sessionId: session.julesSessionId, agentId: session.agentId, goalId: session.goalId, projectId: session.projectId, issueId: session.issueId },
      permissions: { allowedOperations: [...allowedOperations], forbidden: ["accept_outcome", "merge_pull_request", "approve_external_action", "mutate_budget", "mutate_fleet", "admin"] },
    };
  }

  return { getSessionByRun, promote, getContext };
}

const JULES_RUN_OPERATIONS_SAFE = ["read_run_context", "report_progress", "report_blocker", "report_artifact", "propose_workstream", "request_approval", "submit_completion_candidate"];
