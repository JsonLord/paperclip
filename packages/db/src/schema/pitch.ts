import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { projects } from "./projects.js";

export const pitchDecks = pgTable("pitch_decks", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  deckId: text("deck_id").notNull(), version: text("version").notNull(), sourceStateVersion: text("source_state_version").notNull(), sourceFingerprint: text("source_fingerprint").notNull(), resourceVersion: text("resource_version").notNull(), slides: jsonb("slides").$type<Record<string, unknown>[]>().notNull(), claimMap: jsonb("claim_map").$type<Record<string, unknown>>().notNull(), readiness: jsonb("readiness").$type<Record<string, unknown>>().notNull(), renderStatus: text("render_status").notNull(), decision: text("decision").notNull(), status: text("status").notNull(), compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyDeckVersionUnique: uniqueIndex("pitch_decks_company_deck_version_uniq").on(table.companyId, table.deckId, table.version), companyFingerprintUnique: uniqueIndex("pitch_decks_company_fingerprint_uniq").on(table.companyId, table.sourceFingerprint) }));
