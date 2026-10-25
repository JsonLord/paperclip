import { eq } from "drizzle-orm";
import { JulesApiClient } from "@paperclipai/adapter-jules/server";
import type { Db } from "@paperclipai/db";
import { julesCapacityEvents, julesProfiles, julesSessions } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { julesSessionService, type JulesLifecycleHooks, type JulesRemoteReader } from "./jules-sessions.js";
import { secretService } from "./secrets.js";
import { julesCapacityBroker } from "./jules-capacity-broker.js";

export interface JulesReconcilerOptions {
  intervalMs?: number;
  remoteForSession?: (session: { companyId: string; profileId: string }) => Promise<JulesRemoteReader>;
  hooks?: JulesLifecycleHooks;
}

let activeKick: (() => void) | null = null;

export function requestJulesReconciliation() {
  activeKick?.();
}

export function createJulesReconciler(db: Db, options: JulesReconcilerOptions = {}) {
  const secrets = secretService(db);
  const defaultRemoteForSession = async (session: { companyId: string; profileId: string }) => {
    const profile = await db.select().from(julesProfiles).where(eq(julesProfiles.id, session.profileId)).limit(1)
      .then((rows) => rows[0] ?? null);
    if (!profile) throw new Error(`Jules profile ${session.profileId} not found`);
    const apiKey = await secrets.resolveSecretValue(session.companyId, profile.secretRef, "latest");
    return new JulesApiClient(process.env.JULES_API_BASE_URL ?? "https://jules.googleapis.com/v1alpha", apiKey);
  };

  const hooks: JulesLifecycleHooks = {
    onRemoteCompleted: async (session) => {
      await logActivity(db, { companyId: session.companyId, actorType: "system", actorId: "jules-reconciler", action: "jules.session.completed_unvalidated", entityType: "jules_session", entityId: session.id, details: { issueId: session.issueId, goalId: session.goalId, projectId: session.projectId, pullRequestUrl: session.pullRequestUrl } });
      await options.hooks?.onRemoteCompleted?.(session);
    },
    onPlanApprovalRequired: options.hooks?.onPlanApprovalRequired,
    onUserFeedbackRequired: options.hooks?.onUserFeedbackRequired,
    onRemoteFailed: options.hooks?.onRemoteFailed,
    onRemoteOrphaned: options.hooks?.onRemoteOrphaned,
    onCapacityReleased: options.hooks?.onCapacityReleased,
  };
  const sessions = julesSessionService(db, hooks);

  /**
   * A Jules session that has produced a plan stops and waits for that plan to be
   * approved, and nothing in this deployment ever approved one: the adapter only does
   * so when autoApprovePlan is set, which no FounderOS worker sets, and the lifecycle
   * hook was declared and left unwired. The session sat in AWAITING_PLAN_APPROVAL
   * forever while its run had already returned exitCode 0 and released the agent — a
   * deadlock that reads as success.
   *
   * This is checked on every cycle rather than on the transition into the state. A
   * session already waiting when the process restarts never transitions again, so an
   * edge-triggered rescue would leave exactly the sessions that most need rescuing.
   * Once-only is enforced by the capacity event's (session, type) unique index, which
   * survives the restart that the in-memory alternative would not.
   *
   * The default is to record and hold, not to approve. Approving on the deployment's
   * behalf would remove a gate a person put there, and the one session observed so far
   * left AWAITING_PLAN_APPROVAL on its own within minutes — so a deadlock is a risk this
   * guards against, not a behaviour that has been seen. Recording it is what was missing.
   * JULES_AUTO_APPROVE_PLAN opts in to approving, for a deployment that has decided the
   * plan is internal work planning rather than a decision it wants to make.
   */
  async function settlePlanApproval(session: typeof julesSessions.$inferSelect) {
    if (session.status !== "AWAITING_PLAN_APPROVAL") return;
    const holdForHuman = !/^(1|true|yes)$/i.test(process.env.JULES_AUTO_APPROVE_PLAN ?? "");
    const eventType = holdForHuman ? "plan_awaiting_human" : "plan_approved";
    const [claimed] = await db.insert(julesCapacityEvents)
      .values({ profileId: session.profileId, companyId: session.companyId, sessionId: session.id, eventType, details: { julesSessionId: session.julesSessionId } })
      .onConflictDoNothing()
      .returning();
    if (!claimed) return;
    if (!holdForHuman) {
      const remote = await (options.remoteForSession ?? defaultRemoteForSession)(session);
      const approver = (remote as { approvePlan?: (id: string) => Promise<void> }).approvePlan;
      if (typeof approver !== "function") throw new Error("Jules remote client cannot approve plans");
      await approver.call(remote, session.julesSessionId);
    }
    await logActivity(db, {
      companyId: session.companyId, actorType: "system", actorId: "jules-reconciler",
      action: holdForHuman ? "jules.session.plan_awaiting_human" : "jules.session.plan_approved",
      entityType: "jules_session", entityId: session.id,
      details: { issueId: session.issueId, julesSessionId: session.julesSessionId },
    });
  }

  let running: Promise<{ reconciled: number; failed: number }> | null = null;
  async function reconcileNow() {
    if (running) return running;
    running = (async () => {
      const candidates = await sessions.listReconciliationCandidates();
      let reconciled = 0;
      let failed = 0;
      for (const session of candidates) {
        try {
          const remote = await (options.remoteForSession ?? defaultRemoteForSession)(session);
          const updated = await sessions.reconcile(session, remote);
          reconciled += 1;
          // Separately guarded: a plan left unapproved is the session's problem, not the
          // cycle's, and must not stop the other candidates from reconciling.
          try { await settlePlanApproval(updated ?? session); }
          catch (error) { logger.error({ err: error, julesSessionId: session.id }, "Jules plan approval failed"); }
        } catch (error) {
          failed += 1;
          logger.error({ err: error, julesSessionId: session.id, remoteSessionId: session.julesSessionId }, "Jules session reconciliation failed");
        }
      }
      return { reconciled, failed };
    })().finally(() => { running = null; });
    return running;
  }

  return { reconcileNow };
}

export function startJulesReconciler(db: Db, options: JulesReconcilerOptions = {}) {
  const reconciler = createJulesReconciler(db, options);
  void julesCapacityBroker(db).recoverStaleLeases().catch((err) => logger.error({ err }, "Jules stale lease recovery failed"));
  const kick = () => { void reconciler.reconcileNow(); };
  activeKick = kick;
  kick();
  const interval = setInterval(kick, options.intervalMs ?? Number(process.env.JULES_RECONCILE_INTERVAL_MS || 30_000));
  interval.unref();
  return {
    reconcileNow: reconciler.reconcileNow,
    stop: () => {
      clearInterval(interval);
      if (activeKick === kick) activeKick = null;
    },
  };
}
