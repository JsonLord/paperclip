import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companyDeployments } from "./mvp_reliability.js";
import { issues } from "./issues.js";

export const productUsageEvents = pgTable("product_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  deploymentId: uuid("deployment_id").notNull().references(() => companyDeployments.id, { onDelete: "cascade" }), eventId: text("event_id").notNull(),
  accountRef: text("account_ref"), customerRef: text("customer_ref"), opportunityRef: text("opportunity_ref"), offerId: text("offer_id"), sessionRef: text("session_ref"), userRef: text("user_ref"),
  eventType: text("event_type").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), productVersion: text("product_version"), deploymentRevision: text("deployment_revision"),
  source: text("source").notNull(), sourceRef: text("source_ref").notNull(), environment: text("environment").notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyEventUnique: uniqueIndex("product_usage_events_company_event_uniq").on(t.companyId, t.eventId), accountTimeIdx: index("product_usage_events_account_time_idx").on(t.companyId, t.accountRef, t.occurredAt) }));

export const activationDefinitions = pgTable("activation_definitions", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), activationId: text("activation_id").notNull(), offerId: text("offer_id").notNull(),
  segmentId: text("segment_id").notNull(), version: integer("version").notNull(), name: text("name").notNull(), requiredEventTypes: jsonb("required_event_types").$type<string[]>().notNull(), eventOrder: jsonb("event_order").$type<string[]>().notNull().default([]), valueEventType: text("value_event_type").notNull(), measurementWindow: text("measurement_window").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(), sourceIds: jsonb("source_ids").$type<string[]>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyActivationUnique: uniqueIndex("activation_definitions_company_activation_uniq").on(t.companyId, t.activationId, t.version) }));

export const valueHypotheses = pgTable("value_hypotheses", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), valueHypothesisId: text("value_hypothesis_id").notNull(), offerId: text("offer_id").notNull(), segmentId: text("segment_id").notNull(),
  expectedOutcome: text("expected_outcome").notNull(), metric: text("metric"), baseline: text("baseline"), target: text("target"), measurementWindow: text("measurement_window").notNull(), evidenceRequired: jsonb("evidence_required").$type<string[]>().notNull(), sourceIds: jsonb("source_ids").$type<string[]>().notNull(), assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyValueHypothesisUnique: uniqueIndex("value_hypotheses_company_id_uniq").on(t.companyId, t.valueHypothesisId) }));

export const customerOutcomes = pgTable("customer_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), outcomeId: text("outcome_id").notNull(), accountRef: text("account_ref").notNull(), customerRef: text("customer_ref"), offerId: text("offer_id").notNull(), offerVersion: text("offer_version"), valueHypothesisId: text("value_hypothesis_id").notNull(), evidenceClass: text("evidence_class").notNull(), observation: text("observation").notNull(), measurement: jsonb("measurement").$type<Record<string, unknown>>().notNull().default({}), source: text("source").notNull(), sourceRef: text("source_ref").notNull(), observedAt: timestamp("observed_at", { withTimezone: true }).notNull(), window: text("window"), confidence: text("confidence").notNull(), evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(), contradictions: jsonb("contradictions").$type<string[]>().notNull().default([]), productVersion: text("product_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyOutcomeUnique: uniqueIndex("customer_outcomes_company_outcome_uniq").on(t.companyId, t.outcomeId) }));

export const retentionWindows = pgTable("retention_windows", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), windowId: text("window_id").notNull(), accountRef: text("account_ref").notNull(), model: text("model").notNull(), rationale: text("rationale").notNull(), windowType: text("window_type").notNull(), version: integer("version").notNull(), definition: text("definition").notNull(), startAt: timestamp("start_at", { withTimezone: true }).notNull(), endAt: timestamp("end_at", { withTimezone: true }).notNull(), requiredSignal: text("required_signal").notNull(), status: text("status").notNull().default("OPEN"), sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyWindowUnique: uniqueIndex("retention_windows_company_window_uniq").on(t.companyId, t.windowId) }));

export const retentionEvents = pgTable("retention_events", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), retentionEventId: text("retention_event_id").notNull(), windowId: uuid("window_id").references(() => retentionWindows.id, { onDelete: "set null" }), accountRef: text("account_ref").notNull(), type: text("type").notNull(), stage: text("stage"), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), source: text("source").notNull(), sourceRef: text("source_ref").notNull(), evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(), churnReason: text("churn_reason"), churnReasonProvenance: text("churn_reason_provenance"), referredAccountRef: text("referred_account_ref"), channel: text("channel"), result: text("result"),
  reliabilityObservationId: text("reliability_observation_id"), reliabilityIssueId: uuid("reliability_issue_id").references(() => issues.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyRetentionEventUnique: uniqueIndex("retention_events_company_event_uniq").on(t.companyId, t.retentionEventId) }));

export const customerCostObservations = pgTable("customer_cost_observations", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), costObservationId: text("cost_observation_id").notNull(), accountRef: text("account_ref").notNull(), costType: text("cost_type").notNull(), amountMinor: integer("amount_minor"), currency: text("currency"), periodStart: timestamp("period_start", { withTimezone: true }).notNull(), periodEnd: timestamp("period_end", { withTimezone: true }).notNull(), provenance: text("provenance").notNull(), source: text("source").notNull(), sourceRef: text("source_ref").notNull(), allocationFormula: text("allocation_formula"), evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ companyCostUnique: uniqueIndex("customer_cost_observations_company_cost_uniq").on(t.companyId, t.costObservationId) }));
