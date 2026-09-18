import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { projects } from "./projects.js";

export const financialPlans = pgTable("financial_plans", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(), version: text("version").notNull(), sourceStateVersion: text("source_state_version").notNull(), sourceFingerprint: text("source_fingerprint").notNull(),
  templateId: text("template_id").notNull(), templateVersion: text("template_version").notNull(), horizon: jsonb("horizon").$type<{ startPeriod: string; endPeriod: string; granularity: string }>().notNull(),
  canonicalModel: jsonb("canonical_model").$type<Record<string, unknown>>().notNull(), decision: text("decision").notNull(), status: text("status").notNull(), workbookStatus: text("workbook_status").notNull(),
  compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyPlanVersionUnique: uniqueIndex("financial_plans_company_plan_version_uniq").on(table.companyId, table.planId, table.version), companyPlanFingerprintUnique: uniqueIndex("financial_plans_company_fingerprint_uniq").on(table.companyId, table.sourceFingerprint) }));

export const forecastAssumptions = pgTable("forecast_assumptions", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), financialPlanId: uuid("financial_plan_id").notNull().references(() => financialPlans.id, { onDelete: "cascade" }),
  assumptionId: text("assumption_id").notNull(), name: text("name").notNull(), description: text("description").notNull(), value: text("value"), range: jsonb("range").$type<{ min: number; max: number }>(), unit: text("unit").notNull(), period: text("period").notNull(), startPeriod: text("start_period").notNull(), sourceIds: jsonb("source_ids").$type<string[]>().notNull(), basis: text("basis").notNull(), confidence: text("confidence").notNull(), scenario: text("scenario").notNull(), sensitivity: text("sensitivity").notNull(), status: text("status").notNull(),
}, (table) => ({ companyForecastAssumptionUnique: uniqueIndex("forecast_assumptions_company_assumption_uniq").on(table.companyId, table.assumptionId, table.scenario) }));
