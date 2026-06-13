import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const firmSnapshots = pgTable(
  "firm_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceRepo: text("source_repo").notNull(),
    commitSha: text("commit_sha"),
    snapshotJson: jsonb("snapshot_json").notNull().$type<Record<string, unknown>>(),
    contextMarkdown: text("context_markdown").notNull(),
    isLatest: boolean("is_latest").notNull().default(true),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("firm_snapshots_company_idx").on(table.companyId),
    latestIdx: index("firm_snapshots_latest_idx").on(table.companyId, table.isLatest),
  }),
);
