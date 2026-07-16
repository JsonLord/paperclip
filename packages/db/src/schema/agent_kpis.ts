import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, real, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const agentKpis = pgTable(
  "agent_kpis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    taskCompleted: boolean("task_completed"),
    selfAssessmentScore: real("self_assessment_score"),
    tokensUsed: bigint("tokens_used", { mode: "number" }),
    costCents: integer("cost_cents"),
    durationSeconds: integer("duration_seconds"),
    errorsEncountered: integer("errors_encountered").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("agent_kpis_agent_idx").on(table.agentId),
    companyIdx: index("agent_kpis_company_idx").on(table.companyId),
    agentCreatedIdx: index("agent_kpis_agent_created_idx").on(table.agentId, table.createdAt),
  }),
);

export const agentKpiDefinitions = pgTable(
  "agent_kpi_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    metadataKey: text("metadata_key").notNull(),
    targetValue: real("target_value"),
    direction: text("direction").notNull().$type<"higher_is_better" | "lower_is_better">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("agent_kpi_definitions_company_idx").on(table.companyId),
  }),
);

export const agentExperiments = pgTable(
  "agent_experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    hypothesis: text("hypothesis").notNull(),
    approachA: text("approach_a").notNull(),
    approachB: text("approach_b").notNull(),
    taskType: text("task_type"),
    status: text("status").notNull().$type<"running" | "concluded">(),
    winningApproach: text("winning_approach"),
    runsA: integer("runs_a").notNull().default(0),
    runsB: integer("runs_b").notNull().default(0),
    kpiResultsA: jsonb("kpi_results_a").$type<Record<string, unknown>>().notNull().default({}),
    kpiResultsB: jsonb("kpi_results_b").$type<Record<string, unknown>>().notNull().default({}),
    changeNotes: text("change_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    concludedAt: timestamp("concluded_at", { withTimezone: true }),
  },
  (table) => ({
    agentIdx: index("agent_experiments_agent_idx").on(table.agentId),
    companyIdx: index("agent_experiments_company_idx").on(table.companyId),
  }),
);

export const agentKpiObservations = pgTable(
  "agent_kpi_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    observerType: text("observer_type").notNull().$type<"ceo_agent" | "board_human">(),
    observerAgentId: uuid("observer_agent_id").references(() => agents.id),
    observerUserId: uuid("observer_user_id"),
    observation: text("observation").notNull(),
    agentIds: jsonb("agent_ids").$type<string[]>().notNull().default([]),
    actionTaken: boolean("action_taken").notNull().default(false),
    actionNotes: text("action_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("agent_kpi_observations_company_idx").on(table.companyId),
  }),
);
