import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { dispatchIntents } from "@paperclipai/db";

export type DispatchState = "INTENT" | "DISPATCHED" | "CONFIRMED" | "FAILED" | "UNKNOWN";

export interface DispatchIntentView {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  activationKey: string;
  fencingToken: number;
  controllerId: string;
  state: DispatchState;
  runId: string | null;
  externalSessionId: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

function view(row: typeof dispatchIntents.$inferSelect): DispatchIntentView {
  return {
    id: row.id,
    companyId: row.companyId,
    agentId: row.agentId,
    issueId: row.issueId,
    activationKey: row.activationKey,
    fencingToken: Number(row.fencingToken),
    controllerId: row.controllerId,
    state: row.state as DispatchState,
    runId: row.runId,
    externalSessionId: row.externalSessionId,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

/**
 * Durable idempotent dispatch ledger (GATE05-R WP3).
 *
 * One campaign activation key maps to exactly one dispatch record, enforced by
 * a unique index; recordIntent is the compare-and-swap. A replayed key never
 * reaches the provider again — the caller is answered from the stored row.
 *
 * Every state move is a CAS on the CURRENT state, so racing reconcilers cannot
 * double-transition an intent. Pre-allocation failure (a FAILED intent with an
 * error code and no external session — the October 24 `jules_auth_required`
 * case) is deliberately distinguishable from UNKNOWN (response lost while a
 * session may exist). UNKNOWN blocks re-dispatch of that agent until a
 * reconcile explicitly confirms no session exists.
 */
export function dispatchLedgerService(db: Db) {
  async function recordIntent(input: {
    companyId: string;
    agentId: string;
    issueId?: string | null;
    activationKey: string;
    fencingToken: number;
    controllerId: string;
  }): Promise<{ kind: "NEW"; intent: DispatchIntentView } | { kind: "REPLAY"; intent: DispatchIntentView }> {
    const [inserted] = await db
      .insert(dispatchIntents)
      .values({
        companyId: input.companyId,
        agentId: input.agentId,
        issueId: input.issueId ?? null,
        activationKey: input.activationKey,
        fencingToken: input.fencingToken,
        controllerId: input.controllerId,
        state: "INTENT",
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { kind: "NEW", intent: view(inserted) };
    const [existing] = await db
      .select()
      .from(dispatchIntents)
      .where(eq(dispatchIntents.activationKey, input.activationKey))
      .limit(1);
    return { kind: "REPLAY", intent: view(existing!) };
  }

  /** CAS state transition; returns null when the row is no longer in fromState. */
  async function transition(input: {
    id: string;
    fromState: DispatchState;
    toState: DispatchState;
    runId?: string | null;
    externalSessionId?: string | null;
    errorCode?: string | null;
    detail?: unknown;
  }): Promise<DispatchIntentView | null> {
    // Terminal states are frozen at the ledger level: a completed activation
    // (CONFIRMED/FAILED) can never be rewritten, even by a caller that holds a
    // matching fromState. Re-running an activation requires a NEW key.
    if (input.fromState === "CONFIRMED" || input.fromState === "FAILED") return null;
    const now = new Date();
    const patch: Record<string, unknown> = { state: input.toState, updatedAt: now };
    if (input.runId !== undefined) patch.runId = input.runId;
    if (input.externalSessionId !== undefined) patch.externalSessionId = input.externalSessionId;
    if (input.errorCode !== undefined) patch.errorCode = input.errorCode;
    if (input.detail !== undefined) patch.detail = input.detail;
    if (input.toState === "CONFIRMED" || input.toState === "FAILED") patch.completedAt = now;
    const [updated] = await db
      .update(dispatchIntents)
      .set(patch as Partial<typeof dispatchIntents.$inferInsert>)
      .where(and(eq(dispatchIntents.id, input.id), eq(dispatchIntents.state, input.fromState)))
      .returning();
    return updated ? view(updated) : null;
  }

  async function getByKey(activationKey: string): Promise<DispatchIntentView | null> {
    const [row] = await db
      .select()
      .from(dispatchIntents)
      .where(eq(dispatchIntents.activationKey, activationKey))
      .limit(1);
    return row ? view(row) : null;
  }

  async function listIntents(input: { companyId: string; state?: DispatchState; limit?: number; offset?: number }): Promise<{ rows: DispatchIntentView[]; nextOffset: number | null }> {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);
    const conditions = [eq(dispatchIntents.companyId, input.companyId)];
    if (input.state) conditions.push(eq(dispatchIntents.state, input.state));
    const rows = await db
      .select()
      .from(dispatchIntents)
      .where(and(...conditions))
      .orderBy(desc(dispatchIntents.createdAt))
      .limit(offset + limit + 1);
    const page = rows.slice(offset);
    const hasMore = page.length > limit;
    return {
      rows: page.slice(0, limit).map(view),
      nextOffset: hasMore ? offset + Math.min(page.length, limit) : null,
    };
  }

  return { recordIntent, transition, getByKey, listIntents };
}
