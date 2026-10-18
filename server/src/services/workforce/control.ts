import { and, eq, sql } from "drizzle-orm";
import {
  workforceActivations,
  workforceMembers,
  validationProgrammes,
  githubActionRuns,
  julesSessions,
  activityLog,
  type Db,
} from "@paperclipai/db";
import { notFound } from "../../errors.js";
import { issueService } from "../issues.js";
/** Withdraw host execution authority immediately; never pretend an unconfirmed remote job has stopped. */
export function workforceControlService(
  db: Db,
  cancelLocal: (agentId: string) => Promise<unknown>,
) {
  async function stop(
    companyId: string,
    id: string,
    reason: string,
    actorId: string,
  ) {
    const activation = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`workforce:${companyId}`}))`,
      );
      const [a] = await tx
        .select()
        .from(workforceActivations)
        .where(
          and(
            eq(workforceActivations.companyId, companyId),
            eq(workforceActivations.id, id),
          ),
        );
      if (!a) throw notFound("Workforce activation not found");
      if (["DONE", "CANCELLED"].includes(a.status)) return a;
      await tx
        .update(workforceActivations)
        .set({ status: "STOP_REQUESTED" })
        .where(eq(workforceActivations.id, id));
      await tx
        .update(workforceMembers)
        .set({ state: "WAITING", updatedAt: new Date() })
        .where(eq(workforceMembers.id, a.memberId));
      if (a.issueId)
        await issueService(tx as unknown as Db).update(a.issueId, {
          status: "cancelled",
          assigneeAgentId: null,
        });
      await tx.insert(activityLog).values({
        companyId,
        actorType: "system",
        actorId,
        action: "workforce.stop_requested",
        entityType: "workforce_activation",
        entityId: id,
        details: { reason },
      });
      return { ...a, status: "STOP_REQUESTED" };
    });
    if (activation.status !== "STOP_REQUESTED")
      return { status: activation.status, activation };
    const [member] = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.id, activation.memberId));
    await cancelLocal(member.agentId);
    const actions = activation.issueId
      ? await db
          .select()
          .from(githubActionRuns)
          .where(
            and(
              eq(githubActionRuns.companyId, companyId),
              eq(githubActionRuns.issueId, activation.issueId),
            ),
          )
      : [];
    const sessions = activation.issueId
      ? await db
          .select()
          .from(julesSessions)
          .where(
            and(
              eq(julesSessions.companyId, companyId),
              eq(julesSessions.issueId, activation.issueId),
            ),
          )
      : [];
    const remotePending =
      actions.some(
        (r) => r.status !== "prepared" && r.status !== "completed",
      ) || sessions.some((r) => !["COMPLETED", "FAILED"].includes(r.status));
    if (remotePending)
      return {
        status: "REMOTE_STOP_PENDING",
        activation,
        reason:
          "Host dispatch is stopped. Reconcile or stop the remote job before releasing this specialist.",
      };
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`workforce:${companyId}`}))`,
      );
      const [row] = await tx
        .update(workforceActivations)
        .set({ status: "CANCELLED", finishedAt: new Date() })
        .where(eq(workforceActivations.id, id))
        .returning();
      await tx
        .update(workforceMembers)
        .set({
          state: member.definition.activation.defaultState,
          updatedAt: new Date(),
        })
        .where(eq(workforceMembers.id, member.id));
      await tx.insert(activityLog).values({
        companyId,
        actorType: "system",
        actorId,
        action: "workforce.stopped",
        entityType: "workforce_activation",
        entityId: id,
        details: { reason },
      });
      return { status: "CANCELLED", activation: row };
    });
  }
  async function stopInvalid() {
    const active = await db
      .select()
      .from(workforceActivations)
      .where(eq(workforceActivations.status, "ACTIVE"));
    for (const a of active) {
      const [p] = await db
        .select()
        .from(validationProgrammes)
        .where(eq(validationProgrammes.companyId, a.companyId));
      if (!p || p.pausedAt || p.phase !== a.phase)
        await stop(
          a.companyId,
          a.id,
          "Programme phase or pause withdrew activation authority",
          "workforce_scheduler",
        );
    }
  }
  return { stop, stopInvalid };
}
