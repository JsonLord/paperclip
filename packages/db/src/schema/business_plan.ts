import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { projects } from "./projects.js";

export const businessPlans = pgTable("business_plans", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(), version: text("version").notNull(), sourceStateVersion: text("source_state_version").notNull(), sourceFingerprint: text("source_fingerprint").notNull(), bpwResourceVersion: text("bpw_resource_version").notNull(),
  chapters: jsonb("chapters").$type<Record<string, unknown>>().notNull(), claimEvidenceMap: jsonb("claim_evidence_map").$type<Record<string, unknown>>().notNull(), sources: jsonb("sources").$type<Record<string, unknown>>().notNull(), risks: jsonb("risks").$type<Record<string, unknown>>().notNull(), readiness: jsonb("readiness").$type<Record<string, unknown>>().notNull(),
  decision: text("decision").notNull(), status: text("status").notNull(), renderStatus: text("render_status").notNull(), compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyPlanVersionUnique: uniqueIndex("business_plans_company_plan_version_uniq").on(table.companyId, table.planId, table.version), companyFingerprintUnique: uniqueIndex("business_plans_company_fingerprint_uniq").on(table.companyId, table.sourceFingerprint) }));
