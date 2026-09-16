export type JulesProfileStatus = "active" | "degraded" | "quota_exhausted" | "auth_required" | "source_access_missing" | "cooldown" | "disabled";
export type JulesAdmissionCode = "NO_PROFILE_AVAILABLE" | "QUOTA_EXHAUSTED" | "CONCURRENCY_EXHAUSTED" | "RESERVE_ONLY" | "SOURCE_ACCESS_MISSING" | "CAPABILITY_MISSING" | "PROFILE_DEGRADED" | "WRITE_SCOPE_CONFLICT" | "AUTH_REQUIRED";
export type JulesSessionStatus =
  | "DISPATCHING" | "QUEUED" | "PLANNING" | "AWAITING_PLAN_APPROVAL"
  | "AWAITING_USER_FEEDBACK" | "IN_PROGRESS" | "PAUSED" | "FAILED"
  | "COMPLETED_UNVALIDATED" | "VALIDATING" | "AWAITING_MANAGER_JUDGMENT"
  | "REVISION_REQUESTED" | "ACCEPTED" | "ESCALATED" | "ORPHANED";

export interface JulesProfile {
  id: string; name: string; status: JulesProfileStatus; enabled: boolean; plan: string | null;
  secretRef: string; sessionStartLimit: number; sessionStartWindowSec: number;
  concurrentSessionLimit: number; reserveSessionStarts: number; capabilities: string[];
}
export interface CompanyJulesSource {
  id: string; companyId: string; repository: string; source: string; startingBranch: string;
  enabled: boolean; requiredCapabilities: string[];
}
export interface JulesSession {
  id: string; companyId: string; profileId: string; companySourceId: string; paperclipRunId: string;
  agentId: string; goalId: string | null; projectId: string | null; issueId: string | null;
  julesSessionId: string; status: JulesSessionStatus; outcomeId: string | null;
  lastActivityId: string | null; pullRequestUrl: string | null; pullRequestTitle: string | null;
  pullRequestDescription: string | null; remoteUpdatedAt: string | null; completionCandidate: boolean;
}
export type JulesDispatchDecision =
  | { kind: "dispatch"; profileId: string }
  | { kind: "queue" | "wait" | "blocked_missing_capability" | "blocked_no_source_access" | "blocked_quota" | "blocked_conflict"; reason: string };
