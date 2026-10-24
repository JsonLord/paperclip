import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { controllerLeases } from "@paperclipai/db";

export type LeaseErrorCode = "STALE_FENCING_TOKEN" | "NOT_LEASE_HOLDER" | "LEASE_EXPIRED" | "NO_LEASE";

export type LeaseAcquireResult =
  | { kind: "HELD"; fencingToken: number; leaseExpiresAt: Date }
  | { kind: "HELD_BY_OTHER"; fencingToken: number; leaseExpiresAt: Date; controllerId: string }
  | { kind: "NO_LEASE" };

export interface ControllerLeaseView {
  companyId: string;
  controllerId: string;
  fencingToken: number;
  acquiredAt: Date;
  leaseExpiresAt: Date;
  renewedAt: Date | null;
  releaseReason: string | null;
}

const DEFAULT_LEASE_TTL_MS = 15 * 60 * 1000;
const MIN_LEASE_TTL_MS = 5_000;

function view(row: typeof controllerLeases.$inferSelect): ControllerLeaseView {
  return {
    companyId: row.companyId,
    controllerId: row.controllerId,
    fencingToken: Number(row.fencingToken),
    acquiredAt: row.acquiredAt,
    leaseExpiresAt: row.leaseExpiresAt,
    renewedAt: row.renewedAt,
    releaseReason: row.releaseReason,
  };
}

/**
 * Durable single-controller ownership for campaign dispatch (GATE05-R WP2).
 *
 * Exactly one lease row exists per company and every mutation is a single
 * compare-and-swap statement. This is what makes two competing controllers —
 * even ones sharing the same admin identity — unable to both authorize a
 * dispatch: a takeover is permitted only against an EXPIRED lease and always
 * increments the fencing token atomically, so a controller that lost ownership
 * (or crashed and resumed with stale state) can never be mistaken for the
 * current owner. Native execution admission verifies the token before creating
 * any provider reservation, so an expired or superseded lease never authorizes
 * new remote work. It does NOT abandon in-flight work: an expired lease alone
 * cannot release a live session, which is verified separately at the broker.
 */
export function controllerLeaseService(db: Db) {
  async function acquireLease(input: {
    companyId: string;
    controllerId: string;
    leaseTtlMs?: number;
    now?: Date;
  }): Promise<LeaseAcquireResult> {
    const now = input.now ?? new Date();
    const ttlMs = Math.max(MIN_LEASE_TTL_MS, input.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS);
    const expiresAt = new Date(now.getTime() + ttlMs);

    // 1) First owner: insert only when no row exists; the unique index makes this CAS.
    const [inserted] = await db
      .insert(controllerLeases)
      .values({
        companyId: input.companyId,
        controllerId: input.controllerId,
        fencingToken: 1,
        acquiredAt: now,
        leaseExpiresAt: expiresAt,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { kind: "HELD", fencingToken: Number(inserted.fencingToken), leaseExpiresAt: inserted.leaseExpiresAt };

    // 2) Current holder renewing a still-active lease: extend expiry, keep the token.
    const [renewed] = await db
      .update(controllerLeases)
      .set({ leaseExpiresAt: expiresAt, renewedAt: now, updatedAt: now })
      .where(and(
        eq(controllerLeases.companyId, input.companyId),
        eq(controllerLeases.controllerId, input.controllerId),
        gt(controllerLeases.leaseExpiresAt, now),
      ))
      .returning();
    if (renewed) return { kind: "HELD", fencingToken: Number(renewed.fencingToken), leaseExpiresAt: renewed.leaseExpiresAt };

    // 3) Takeover of an EXPIRED lease: CAS on expiry, increment the token atomically.
    const [takenOver] = await db
      .update(controllerLeases)
      .set({
        controllerId: input.controllerId,
        fencingToken: sql`${controllerLeases.fencingToken} + 1`,
        acquiredAt: now,
        leaseExpiresAt: expiresAt,
        renewedAt: null,
        releaseReason: null,
        updatedAt: now,
      })
      .where(and(
        eq(controllerLeases.companyId, input.companyId),
        lte(controllerLeases.leaseExpiresAt, now),
      ))
      .returning();
    if (takenOver) return { kind: "HELD", fencingToken: Number(takenOver.fencingToken), leaseExpiresAt: takenOver.leaseExpiresAt };

    // 4) Another controller actively holds a non-expired lease.
    const [current] = await db
      .select()
      .from(controllerLeases)
      .where(eq(controllerLeases.companyId, input.companyId))
      .limit(1);
    if (!current) return { kind: "NO_LEASE" };
    return {
      kind: "HELD_BY_OTHER",
      fencingToken: Number(current.fencingToken),
      leaseExpiresAt: current.leaseExpiresAt,
      controllerId: current.controllerId,
    };
  }

  /**
   * Native dispatch must verify the caller's fencing token before creating any
   * provider reservation. A stale, non-current, or expired token is rejected, so a
   * stale controller cannot dispatch after ownership transfers.
   */
  async function verifyLease(input: {
    companyId: string;
    controllerId: string;
    fencingToken: number;
    now?: Date;
  }): Promise<{ ok: true; fencingToken: number } | { ok: false; code: LeaseErrorCode }> {
    const now = input.now ?? new Date();
    const [row] = await db
      .select()
      .from(controllerLeases)
      .where(and(
        eq(controllerLeases.companyId, input.companyId),
        eq(controllerLeases.fencingToken, input.fencingToken),
      ))
      .limit(1);
    if (!row) return { ok: false, code: "STALE_FENCING_TOKEN" };
    if (row.controllerId !== input.controllerId) return { ok: false, code: "NOT_LEASE_HOLDER" };
    if (row.leaseExpiresAt.getTime() <= now.getTime()) return { ok: false, code: "LEASE_EXPIRED" };
    return { ok: true, fencingToken: Number(row.fencingToken) };
  }

  /** Release only the caller's own current lease; burning its token prevents replay. */
  async function releaseLease(input: {
    companyId: string;
    controllerId: string;
    fencingToken: number;
    reason: string;
    now?: Date;
  }): Promise<{ released: boolean; fencingToken: number | null }> {
    const now = input.now ?? new Date();
    const [updated] = await db
      .update(controllerLeases)
      .set({
        fencingToken: sql`${controllerLeases.fencingToken} + 1`,
        leaseExpiresAt: now,
        releaseReason: input.reason,
        updatedAt: now,
      })
      .where(and(
        eq(controllerLeases.companyId, input.companyId),
        eq(controllerLeases.controllerId, input.controllerId),
        eq(controllerLeases.fencingToken, input.fencingToken),
      ))
      .returning();
    return { released: Boolean(updated), fencingToken: updated ? Number(updated.fencingToken) : null };
  }

  async function getLease(companyId: string): Promise<ControllerLeaseView | null> {
    const [row] = await db
      .select()
      .from(controllerLeases)
      .where(eq(controllerLeases.companyId, companyId))
      .limit(1);
    return row ? view(row) : null;
  }

  return { acquireLease, verifyLease, releaseLease, getLease };
}
