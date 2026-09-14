import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const resourcePackSnapshots = pgTable("resource_pack_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  version: text("version").notNull(),
  tier: text("tier").notNull(),
  installedPath: text("installed_path").notNull(),
  sourceRepo: text("source_repo").notNull(),
  sourceCommit: text("source_commit").notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyPackVersionUnique: uniqueIndex("resource_pack_snapshots_company_pack_version_uniq").on(table.companyId, table.packId, table.version),
  companyTierIdx: index("resource_pack_snapshots_company_tier_idx").on(table.companyId, table.tier),
}));
