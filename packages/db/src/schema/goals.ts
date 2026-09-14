import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    level: text("level").notNull().default("task"),
    status: text("status").notNull().default("planned"),
    parentId: uuid("parent_id").references((): AnyPgColumn => goals.id),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id),
    requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default([]),
    supportPacks: jsonb("support_packs").$type<{ id: string; version?: string; required?: boolean }[]>().notNull().default([]),
    requiredCapabilities: jsonb("required_capabilities").$type<string[]>().notNull().default([]),
    inputPaths: jsonb("input_paths").$type<string[]>().notNull().default([]),
    outputPaths: jsonb("output_paths").$type<string[]>().notNull().default([]),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull().default([]),
    cannotCompleteIf: jsonb("cannot_complete_if").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("goals_company_idx").on(table.companyId),
  }),
);
