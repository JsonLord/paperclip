import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const agentProjectSessions = pgTable(
  "agent_project_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    adapterType: text("adapter_type").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    sessionParams: jsonb("session_params").$type<Record<string, unknown>>(),
    sessionDisplayId: text("session_display_id"),
    lastRunId: uuid("last_run_id").references(() => heartbeatRuns.id),
    runCount: integer("run_count").notNull().default(0),
    totalInputTokens: bigint("total_input_tokens", { mode: "number" }).notNull().default(0),
    totalOutputTokens: bigint("total_output_tokens", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentProjectUniqueIdx: uniqueIndex("agent_project_sessions_agent_adapter_project_uniq").on(
      table.agentId,
      table.adapterType,
      table.projectId,
    ),
    companyAgentIdx: index("agent_project_sessions_company_agent_idx").on(
      table.companyId,
      table.agentId,
    ),
  }),
);
