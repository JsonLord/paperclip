export type JulesProfileStatus = "active" | "degraded" | "quota_exhausted" | "auth_required" | "source_access_missing" | "cooldown" | "disabled";
export type JulesSessionStatus = "queued" | "planning" | "awaiting_plan_approval" | "awaiting_user_feedback" | "in_progress" | "paused" | "failed" | "completed" | "cancelled" | "orphaned";

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
  julesSessionId: string; status: JulesSessionStatus; outcomeId: string | null;
  lastActivityId: string | null; pullRequestUrl: string | null; completionCandidate: boolean;
}
export type JulesDispatchDecision =
  | { kind: "dispatch"; profileId: string }
  | { kind: "queue" | "wait" | "blocked_missing_capability" | "blocked_no_source_access" | "blocked_quota" | "blocked_conflict"; reason: string };
