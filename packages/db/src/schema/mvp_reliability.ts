import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companyRepositoryBindings } from "./founderos_bootstrap.js";
import { issues } from "./issues.js";

export const companyDeployments = pgTable("company_deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  deploymentId: text("deployment_id").notNull(),
  repositoryBindingId: uuid("repository_binding_id").notNull().references(() => companyRepositoryBindings.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("huggingface_space"),
  spaceId: text("space_id").notNull(),
  spaceUrl: text("space_url").notNull(),
  runtimeType: text("runtime_type").notNull(),
  deploymentRef: text("deployment_ref"),
  healthEndpoint: text("health_endpoint").notNull(),
  mainEndpoint: text("main_endpoint").notNull(),
  currentRevision: text("current_revision"),
  healthState: text("health_state").notNull().default("UNKNOWN"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
  lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyDeploymentUnique: uniqueIndex("company_deployments_company_deployment_uniq").on(table.companyId, table.deploymentId),
  companySpaceUnique: uniqueIndex("company_deployments_company_space_uniq").on(table.companyId, table.spaceId),
}));

export const runtimeObservations = pgTable("runtime_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  deploymentId: uuid("deployment_id").notNull().references(() => companyDeployments.id, { onDelete: "cascade" }),
  observationId: text("observation_id").notNull(),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  source: text("source").notNull(),
  endpoint: text("endpoint"),
  errorFingerprint: text("error_fingerprint").notNull(),
  statusCode: integer("status_code"),
  summary: text("summary").notNull(),
  rawSourceReference: text("raw_source_reference").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
  affectedCommit: text("affected_commit"),
  affectedRevision: text("affected_revision"),
  state: text("state").notNull().default("OPEN"),
  decision: text("decision"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  verification: jsonb("verification").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyObservationUnique: uniqueIndex("runtime_observations_company_observation_uniq").on(table.companyId, table.observationId),
  deploymentFingerprintUnique: uniqueIndex("runtime_observations_deployment_fingerprint_uniq").on(table.deploymentId, table.errorFingerprint),
  companyStateIdx: index("runtime_observations_company_state_idx").on(table.companyId, table.state),
}));
