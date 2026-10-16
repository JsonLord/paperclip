import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { goals } from "./goals.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import type { ValidationPolicy, NodepadSnapshot } from "@paperclipai/shared";

export const validationProgrammes = pgTable("validation_programmes", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: "cascade" }),
  ceoAgentId: uuid("ceo_agent_id")
    .notNull()
    .references(() => agents.id),
  visionGoalId: uuid("vision_goal_id")
    .notNull()
    .references(() => goals.id),
  directionIssueId: uuid("direction_issue_id")
    .notNull()
    .references(() => issues.id),
  phase: text("phase").notNull().default("EXPLORE"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  phaseStartedAt: timestamp("phase_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  pauseReason: text("pause_reason"),
  pauses: jsonb("pauses")
    .$type<Array<{ start: string; end: string | null; reason: string }>>()
    .notNull()
    .default([]),
  runtimeBindings: jsonb("runtime_bindings")
    .$type<Record<string, Record<string, unknown>>>()
    .notNull()
    .default({}),
  phaseAdjustments: jsonb("phase_adjustments")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  policy: jsonb("policy").$type<ValidationPolicy>().notNull(),
  founderConstraints: jsonb("founder_constraints")
    .$type<string[]>()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const validationRecords = pgTable(
  "validation_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    phase: text("phase").notNull(),
    actorId: text("actor_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idempotency: uniqueIndex("validation_records_company_key_idx").on(
      t.companyId,
      t.kind,
      t.idempotencyKey,
    ),
  }),
);
export const nodepadBindings = pgTable(
  "nodepad_bindings",
  {
    companyId: uuid("company_id")
      .primaryKey()
      .references(() => companies.id, { onDelete: "cascade" }),
    baseUrl: text("base_url").notNull(),
    workspaceId: text("workspace_id").notNull(),
    apiKeySecretRef: uuid("api_key_secret_ref").notNull(),
    snapshot: jsonb("snapshot").$type<NodepadSnapshot>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => ({
    workspace: uniqueIndex("nodepad_binding_workspace_idx").on(
      t.baseUrl,
      t.workspaceId,
    ),
  }),
);
export const githubActionRuns = pgTable("github_action_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  paperclipRunId: uuid("paperclip_run_id")
    .notNull()
    .unique()
    .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  repository: text("repository").notNull(),
  workflow: text("workflow").notNull(),
  ref: text("ref").notNull(),
  credentialSecretRef: uuid("credential_secret_ref").notNull(),
  externalRunId: text("external_run_id"),
  status: text("status").notNull().default("prepared"),
  conclusion: text("conclusion"),
  attempts: integer("attempts").notNull().default(0),
  artifacts: jsonb("artifacts")
    .$type<Array<{ id: number; name: string; url: string }>>()
    .notNull()
    .default([]),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const julesPools = pgTable("jules_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountKey: text("account_key").notNull().unique(),
  dailyStarts: integer("daily_starts").notNull().default(90),
  windowSec: integer("window_sec").notNull().default(86400),
  concurrency: integer("concurrency").notNull().default(3),
});
