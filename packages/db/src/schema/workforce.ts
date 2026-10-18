import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import type {
  ValidationWorkforceDefinition,
  WorkforceAgentDefinition,
  WorkforceOverride,
  WorkforceNeed,
} from "@paperclipai/shared";
export const workforceImports = pgTable("workforce_imports", {
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  sourceCommit: text("source_commit").notNull(),
  importerVersion: text("importer_version").notNull(),
  definition: jsonb("definition")
    .$type<ValidationWorkforceDefinition>()
    .notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const workforceMembers = pgTable(
  "workforce_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agencyId: text("agency_id").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    state: text("state").notNull().default("DORMANT"),
    drift: text("drift").notNull().default("current"),
    definition: jsonb("definition").$type<WorkforceAgentDefinition>().notNull(),
    overrides: jsonb("overrides")
      .$type<WorkforceOverride>()
      .notNull()
      .default({}),
    sourceCommit: text("source_commit").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    agency: uniqueIndex("workforce_members_company_agency_idx").on(
      t.companyId,
      t.agencyId,
    ),
    native: uniqueIndex("workforce_members_native_idx").on(t.agentId),
  }),
);
export const workforceActivations = pgTable(
  "workforce_activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => workforceMembers.id),
    eventKey: text("event_key").notNull(),
    issueId: uuid("issue_id").references(() => issues.id, {
      onDelete: "set null",
    }),
    need: jsonb("need").$type<WorkforceNeed>().notNull(),
    runtime: text("runtime").notNull(),
    phase: text("phase").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    requestedBy: text("requested_by").notNull(),
    sourceCommit: text("source_commit").notNull(),
    result: jsonb("result").$type<{
      report: string;
      artifactIds: string[];
      nodepadRefs: string[];
      outcome: string;
      ventureDecision?:
        | "BUILD_RECOMMENDED"
        | "MORE_VALIDATION_REQUIRED"
        | "PIVOT_RECOMMENDED"
        | "STOP_RECOMMENDED";
    }>(),
    wakeupAt: timestamp("wakeup_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    event: uniqueIndex("workforce_activation_event_idx").on(
      t.companyId,
      t.eventKey,
    ),
  }),
);
