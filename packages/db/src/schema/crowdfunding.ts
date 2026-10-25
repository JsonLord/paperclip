import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const crowdfundingCampaigns = pgTable("crowdfunding_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull(),
  version: text("version").notNull(),
  sourceStateVersion: text("source_state_version").notNull(),
  sourceFingerprint: text("source_fingerprint").notNull(),
  campaign: jsonb("campaign").$type<Record<string, unknown>>().notNull(),
  readiness: text("readiness").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyCampaignVersionUnique: uniqueIndex("crowdfunding_campaigns_company_campaign_version_uniq").on(table.companyId, table.campaignId, table.version),
  companyFingerprintUnique: uniqueIndex("crowdfunding_campaigns_company_fingerprint_uniq").on(table.companyId, table.sourceFingerprint),
}));

export const crowdfundingEvents = pgTable("crowdfunding_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  amount: text("amount"),
  currency: text("currency"),
  subjectRef: text("subject_ref"),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
}, (table) => ({
  companyEventUnique: uniqueIndex("crowdfunding_events_company_event_uniq").on(table.companyId, table.eventId),
}));
