import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

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
  julesSessionId: text("jules_session_id").notNull(),
  status: text("status").notNull().default("queued"),
  outcomeId: text("outcome_id"),
  lastActivityId: text("last_activity_id"),
  pullRequestUrl: text("pull_request_url"),
  completionCandidate: boolean("completion_candidate").notNull().default(false),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ runUnique: uniqueIndex("jules_sessions_paperclip_run_uniq").on(table.paperclipRunId), remoteUnique: uniqueIndex("jules_sessions_remote_uniq").on(table.profileId, table.julesSessionId), activeProfileIdx: index("jules_sessions_profile_status_idx").on(table.profileId, table.status) }));

export const julesCapacityEvents = pgTable("jules_capacity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => julesProfiles.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => julesSessions.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  details: jsonb("details").$type<Record<string, unknown>>(),
}, (table) => ({ profileWindowIdx: index("jules_capacity_events_profile_window_idx").on(table.profileId, table.occurredAt) }));

export const julesCallbackEvents = pgTable("jules_callback_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => julesSessions.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ sessionEventUnique: uniqueIndex("jules_callback_events_session_event_uniq").on(table.sessionId, table.eventId) }));
