import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { agents } from "./agents.js";
import { goals } from "./goals.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";

export const julesProfiles = pgTable("jules_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  enabled: boolean("enabled").notNull().default(true),
  plan: text("plan"),
  secretRef: text("secret_ref").notNull(),
  sessionStartLimit: integer("session_start_limit").notNull().default(15),
  sessionStartWindowSec: integer("session_start_window_sec").notNull().default(86400),
  concurrentSessionLimit: integer("concurrent_session_limit").notNull().default(3),
  reserveSessionStarts: integer("reserve_session_starts").notNull().default(1),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  capabilityReadiness: jsonb("capability_readiness").$type<Record<string, { status: "configured" | "verified" | "missing" | "error"; lastVerifiedAt?: string; notes?: string }>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyJulesSources = pgTable("company_jules_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  repository: text("repository").notNull(),
  source: text("source").notNull(),
  startingBranch: text("starting_branch").notNull().default("main"),
  enabled: boolean("enabled").notNull().default(true),
  requiredCapabilities: jsonb("required_capabilities").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyRepoUnique: uniqueIndex("company_jules_sources_company_repo_uniq").on(table.companyId, table.repository) }));

export const julesProfileSources = pgTable("jules_profile_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => julesProfiles.id, { onDelete: "cascade" }),
  companySourceId: uuid("company_source_id").notNull().references(() => companyJulesSources.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ profileSourceUnique: uniqueIndex("jules_profile_sources_profile_source_uniq").on(table.profileId, table.companySourceId) }));

export const julesSessions = pgTable("jules_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").notNull().references(() => julesProfiles.id),
  companySourceId: uuid("company_source_id").notNull().references(() => companyJulesSources.id),
  paperclipRunId: uuid("paperclip_run_id").notNull().references(() => heartbeatRuns.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  julesSessionId: text("jules_session_id").notNull(),
  status: text("status").notNull().default("QUEUED"),
  outcomeId: text("outcome_id"),
  lastActivityId: text("last_activity_id"),
  pullRequestUrl: text("pull_request_url"),
  pullRequestTitle: text("pull_request_title"),
  pullRequestDescription: text("pull_request_description"),
  remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }),
  lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
  reconciliationError: text("reconciliation_error"),
  capabilityVersion: integer("capability_version").notNull().default(1),
  completionCandidate: boolean("completion_candidate").notNull().default(false),
  revisionCount: integer("revision_count").notNull().default(0),
  retryNumber: integer("retry_number").notNull().default(0),
  retryOfSessionId: uuid("retry_of_session_id"),
  retryOfRunId: uuid("retry_of_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
  retryReason: text("retry_reason"),
  waitReason: text("wait_reason"),
  waitCondition: text("wait_condition"),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ runUnique: uniqueIndex("jules_sessions_paperclip_run_uniq").on(table.paperclipRunId), remoteUnique: uniqueIndex("jules_sessions_remote_uniq").on(table.profileId, table.julesSessionId), activeProfileIdx: index("jules_sessions_profile_status_idx").on(table.profileId, table.status) }));

export const julesSessionActivities = pgTable("jules_session_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => julesSessions.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull(),
  remoteCreatedAt: timestamp("remote_created_at", { withTimezone: true }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ sessionActivityUnique: uniqueIndex("jules_session_activities_session_activity_uniq").on(table.sessionId, table.activityId) }));

export const julesRepositoryLeases = pgTable("jules_repository_leases", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").notNull().references(() => julesProfiles.id),
  sessionId: uuid("session_id").references(() => julesSessions.id, { onDelete: "set null" }),
  paperclipRunId: uuid("paperclip_run_id").notNull().references(() => heartbeatRuns.id, { onDelete: "cascade" }),
  repository: text("repository").notNull(),
  writeScopes: jsonb("write_scopes").$type<string[]>().notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (table) => ({ runUnique: uniqueIndex("jules_repository_leases_run_uniq").on(table.paperclipRunId), activeRepoIdx: index("jules_repository_leases_active_repo_idx").on(table.companyId, table.repository, table.releasedAt) }));

export const julesCapacityEvents = pgTable("jules_capacity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => julesProfiles.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => julesSessions.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  details: jsonb("details").$type<Record<string, unknown>>(),
}, (table) => ({ profileWindowIdx: index("jules_capacity_events_profile_window_idx").on(table.profileId, table.occurredAt), sessionEventUnique: uniqueIndex("jules_capacity_events_session_event_uniq").on(table.sessionId, table.eventType) }));

export const julesCallbackEvents = pgTable("jules_callback_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => julesSessions.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ sessionEventUnique: uniqueIndex("jules_callback_events_session_event_uniq").on(table.sessionId, table.eventId) }));

export const julesValidationResults = pgTable("jules_validation_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  paperclipRunId: uuid("paperclip_run_id").notNull().references(() => heartbeatRuns.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => julesSessions.id, { onDelete: "cascade" }),
  validatedCommit: text("validated_commit").notNull(),
  contractHash: text("contract_hash").notNull(),
  validatorVersion: text("validator_version").notNull(),
  status: text("status").notNull(),
  hardFailure: boolean("hard_failure").notNull(),
  passed: jsonb("passed").$type<Record<string, unknown>[]>().notNull().default([]),
  failed: jsonb("failed").$type<Record<string, unknown>[]>().notNull().default([]),
  warnings: jsonb("warnings").$type<Record<string, unknown>[]>().notNull().default([]),
  evidence: jsonb("evidence").$type<Record<string, unknown>[]>().notNull().default([]),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ validationUnique: uniqueIndex("jules_validation_results_commit_contract_uniq").on(table.sessionId, table.validatedCommit, table.contractHash, table.validatorVersion) }));

export const julesManagerDecisions = pgTable("jules_manager_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => julesSessions.id, { onDelete: "cascade" }),
  validationId: uuid("validation_id").notNull().references(() => julesValidationResults.id, { onDelete: "cascade" }),
  paperclipRunId: uuid("paperclip_run_id").notNull().references(() => heartbeatRuns.id, { onDelete: "cascade" }),
  verdict: text("verdict").notNull(),
  confidence: integer("confidence").notNull(),
  reason: text("reason").notNull(),
  passedCriteria: jsonb("passed_criteria").$type<string[]>().notNull().default([]),
  failedCriteria: jsonb("failed_criteria").$type<string[]>().notNull().default([]),
  revisionInstructions: jsonb("revision_instructions").$type<string[]>().notNull().default([]),
  requiresHuman: boolean("requires_human").notNull(),
  recommendedWaitCondition: text("recommended_wait_condition"),
  recommendedNextAction: text("recommended_next_action"),
  provider: text("provider"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ validationDecisionUnique: uniqueIndex("jules_manager_decisions_validation_uniq").on(table.validationId) }));
