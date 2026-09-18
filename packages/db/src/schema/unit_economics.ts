import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const unitEconomicModels = pgTable("unit_economic_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(), version: integer("version").notNull(),
  unit: text("unit").notNull(), revenueModel: text("revenue_model").notNull(), currency: text("currency").notNull(), period: text("period").notNull(),
  variableCostDefinition: jsonb("variable_cost_definition").$type<string[]>().notNull(),
  fixedCostDefinition: jsonb("fixed_cost_definition").$type<string[]>().notNull().default([]),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(), status: text("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyModelVersionUnique: uniqueIndex("unit_economic_models_company_model_version_uniq").on(table.companyId, table.modelId, table.version) }));

export const economicInputs = pgTable("economic_inputs", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  modelDbId: uuid("model_db_id").notNull().references(() => unitEconomicModels.id, { onDelete: "cascade" }), inputId: text("input_id").notNull(),
  name: text("name").notNull(), value: text("value"), unit: text("unit").notNull(), currency: text("currency"), period: text("period").notNull(), scope: text("scope").notNull(),
  category: text("category").notNull(), classification: text("classification").notNull(), confidence: text("confidence").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(), formula: text("formula"), channel: text("channel"), accountRef: text("account_ref"),
  observedAt: timestamp("observed_at", { withTimezone: true }), calculatedAt: timestamp("calculated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyInputUnique: uniqueIndex("economic_inputs_company_input_uniq").on(table.companyId, table.inputId) }));

export const financialAssumptions = pgTable("financial_assumptions", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  modelDbId: uuid("model_db_id").notNull().references(() => unitEconomicModels.id, { onDelete: "cascade" }), assumptionId: text("assumption_id").notNull(),
  statement: text("statement").notNull(), value: text("value"), range: jsonb("range").$type<{ min: number; max: number }>(), unit: text("unit").notNull(), reason: text("reason").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]), confidence: text("confidence").notNull(), sensitivity: text("sensitivity").notNull(), status: text("status").notNull(), owner: text("owner").notNull(), validationNeeded: text("validation_needed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyAssumptionUnique: uniqueIndex("financial_assumptions_company_assumption_uniq").on(table.companyId, table.assumptionId) }));

export const economicScenarios = pgTable("economic_scenarios", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  modelDbId: uuid("model_db_id").notNull().references(() => unitEconomicModels.id, { onDelete: "cascade" }), scenarioId: text("scenario_id").notNull(),
  name: text("name").notNull(), inputChanges: jsonb("input_changes").$type<Array<{ inputId: string; value: number; reason: string; sourceIds: string[]; assumptionId?: string }>>().notNull(),
  outputs: jsonb("outputs").$type<Record<string, unknown>>().notNull(), maturity: text("maturity").notNull(), calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
}, (table) => ({ companyScenarioUnique: uniqueIndex("economic_scenarios_company_scenario_uniq").on(table.companyId, table.scenarioId) }));
