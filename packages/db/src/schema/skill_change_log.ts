import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companySkills } from "./company_skills.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const skillChangeLog = pgTable(
  "skill_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    skillId: uuid("skill_id").notNull().references(() => companySkills.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    changeNotes: text("change_notes"),
    previousContent: text("previous_content"),
    newContent: text("new_content"),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skillIdx: index("skill_change_log_skill_idx").on(table.skillId),
    agentIdx: index("skill_change_log_agent_idx").on(table.agentId),
    companyIdx: index("skill_change_log_company_idx").on(table.companyId),
  }),
);
