import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { projects } from "./projects.js";

export const businessModelCanvases = pgTable("business_model_canvases", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  canvasId: text("canvas_id").notNull(), version: text("version").notNull(), sourceStateVersion: text("source_state_version").notNull(), sourceFingerprint: text("source_fingerprint").notNull(),
  blocks: jsonb("blocks").$type<Record<string, unknown>>().notNull(), openQuestions: jsonb("open_questions").$type<string[]>().notNull(), staleDependencies: jsonb("stale_dependencies").$type<string[]>().notNull(),
  overallEvidenceCoverage: text("overall_evidence_coverage").notNull(), decision: text("decision").notNull(), status: text("status").notNull(),
  compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyCanvasUnique: uniqueIndex("business_model_canvases_company_canvas_uniq").on(table.companyId, table.canvasId, table.version), companyFingerprintUnique: uniqueIndex("business_model_canvases_company_fingerprint_uniq").on(table.companyId, table.sourceFingerprint) }));
