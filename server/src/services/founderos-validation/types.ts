export type ValidationStatus = "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "BLOCKED";
export type ValidationSeverity = "error" | "warning" | "blocked";
export interface ValidationFinding { code: string; message: string; path?: string; severity: ValidationSeverity; hard?: boolean }
export interface RepositoryFile { path: string; kind?: "file" | "directory"; content?: string }
export interface PullRequestSnapshot { exists: boolean; repository: string; baseBranch: string; headCommit: string; changedFiles: string[]; checks: Array<{ name: string; status: "success" | "failure" | "pending" | "cancelled" }> }
export interface DeterministicValidationInput {
  companyId: string; goalId?: string | null; projectId?: string | null; issueId?: string | null; agentId: string;
  paperclipRunId: string; julesSessionId: string; repository: string; branch: string; baseBranch: string;
  prUrl?: string | null; commitSha: string; requirePullRequest?: boolean; requiredChecks?: string[];
  requiredOutputs: string[]; outputPaths?: string[]; acceptanceCriteria?: string[]; cannotCompleteIf?: Array<string | { code: string; active: boolean; semantic?: boolean }>;
  writeScope: string[]; files: RepositoryFile[]; pullRequest?: PullRequestSnapshot;
  requiredCapabilities?: string[]; firm?: { required: boolean; buildPassed?: boolean; buildBeforePassed?: boolean; buildAfterPassed?: boolean; workspaceRepository?: string };
  requiredEvidenceIds?: string[]; reportedEvidenceIds?: string[]; quantitativeClaims?: Array<{ claim: string; evidenceIds: string[]; generated?: boolean }>;
  externalActions?: Array<{ type: string; executed: boolean; approvalId?: string; approved?: boolean }>;
  knownSecretValues?: string[];
}
export interface DeterministicValidationResult {
  status: ValidationStatus; hardFailure: boolean; passed: ValidationFinding[]; failed: ValidationFinding[]; warnings: ValidationFinding[];
  evidence: Array<{ type: string; id?: string; value?: string }>; validatedCommit: string; validatedAt: string; validatorVersion: string; contractHash: string;
}
