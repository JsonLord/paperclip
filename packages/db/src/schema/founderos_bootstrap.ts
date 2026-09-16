import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const companyRepositoryBindings = pgTable("company_repository_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  repository: text("repository").notNull(),
  repositoryId: text("repository_id"),
  defaultBranch: text("default_branch").notNull(),
  importRef: text("import_ref").notNull(),
  importCommit: text("import_commit").notNull(),
  workspaceRoot: text("workspace_root").notNull().default("/"),
  firmPath: text("firm_path").notNull().default("firm/"),
  founderosPath: text("founderos_path").notNull().default(".founderos/"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyUnique: uniqueIndex("company_repository_bindings_company_uniq").on(table.companyId), repositoryIdx: index("company_repository_bindings_repo_idx").on(table.repository) }));

export const founderosBootstraps = pgTable("founderos_bootstraps", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  repositoryBindingId: uuid("repository_binding_id").notNull().references(() => companyRepositoryBindings.id, { onDelete: "cascade" }),
  contextVersion: text("context_version").notNull(),
  sourceRepository: text("source_repository").notNull(),
  sourceCommit: text("source_commit").notNull(),
  installedCommit: text("installed_commit"),
  status: text("status").notNull(),
  nativeIds: jsonb("native_ids").$type<{ visionGoalId: string; childGoalIds: string[]; managerAgentId: string; workerAgentIds: string[]; projectId: string; issueId: string }>(),
  seedInspection: jsonb("seed_inspection").$type<Record<string, unknown>>().notNull().default({}),
  drift: jsonb("drift").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyVersionUnique: uniqueIndex("founderos_bootstraps_company_version_uniq").on(table.companyId, table.contextVersion), companyStatusIdx: index("founderos_bootstraps_company_status_idx").on(table.companyId, table.status) }));
