import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Durable single-controller ownership for campaign dispatch (GATE05-R WP2).
 *
 * Exactly one row per company. Every mutation is a single compare-and-swap
 * statement so two controllers racing on the same admin identity cannot both
 * hold authority: a takeover only succeeds when the stored lease is expired,
 * and the fencing token increases monotonically so a stale controller that
 * wakes up after losing ownership can never be mistaken for the current owner.
 * Native execution admission verifies the token before creating any provider
 * reservation, and an expired lease never authorizes new remote work.
 */
export const controllerLeases = pgTable(
  "controller_leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    controllerId: text("controller_id").notNull(),
    fencingToken: bigint("fencing_token", { mode: "number" }).notNull().default(1),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    renewedAt: timestamp("renewed_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUnique: uniqueIndex("controller_leases_company_uniq").on(table.companyId),
    expiryIdx: index("controller_leases_expiry_idx").on(table.leaseExpiresAt),
  }),
);
