import { eq } from "drizzle-orm";
import { JulesApiClient } from "@paperclipai/adapter-jules/server";
import type { Db } from "@paperclipai/db";
import { julesProfiles } from "@paperclipai/db";
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

  const defaultRemoteForSession = async (session: { companyId: string; profileId: string }) => {
    const profile = await db.select().from(julesProfiles).where(eq(julesProfiles.id, session.profileId)).limit(1)
      .then((rows) => rows[0] ?? null);
    if (!profile) throw new Error(`Jules profile ${session.profileId} not found`);
    const apiKey = await secrets.resolveSecretValue(session.companyId, profile.secretRef, "latest");
    return new JulesApiClient(process.env.JULES_API_BASE_URL ?? "https://jules.googleapis.com/v1alpha", apiKey);
  };

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
          await sessions.reconcile(session, remote);
          reconciled += 1;
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
