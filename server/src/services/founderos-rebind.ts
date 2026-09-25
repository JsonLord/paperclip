import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog, agents, companies, companyJulesSources, companyRepositoryBindings, founderosBootstraps, issues, julesProfileSources } from "@paperclipai/db";
import { FOUNDEROS_CONTEXT_VERSION, JULES_SOURCE_PAUSE_REASON, type FounderOsSourceResolver } from "./founderos-bootstrap.js";

export interface FounderOsRebindResult {
  rebound: boolean;
  reason: string | null;
  repository: string | null;
  source: string | null;
  profileId: string | null;
  agentsResumed: number;
  issuesUnblocked: number;
  /** Per-profile outcome of Jules Source discovery; present when resolution ran. */
  probes?: unknown[];
}

/**
 * Decide how one Jules worker changes when its company's Source becomes available. Every
 * worker is re-pointed at the resolved Source, but only a worker the bootstrap itself paused
 * for the missing Source resumes: one an operator paused for any other reason stays paused.
 */
export function julesWorkerRebindPatch(worker: { status: string; pauseReason: string | null; adapterConfig?: Record<string, unknown> | null; metadata?: Record<string, unknown> | null }, binding: { repository: string; source: string; startingBranch: string }) {
  const resumable = worker.status === "paused" && worker.pauseReason === JULES_SOURCE_PAUSE_REASON;
  return {
    resumable,
    patch: {
      adapterConfig: { ...(worker.adapterConfig ?? {}), ...binding },
      metadata: { ...(worker.metadata ?? {}), deploymentReady: true },
      ...(resumable ? { status: "idle", pauseReason: null } : {}),
      updatedAt: new Date(),
    },
  };
}

/**
 * Bind (or re-bind) a bootstrapped company to its Jules Source once a profile that can
 * see the repository exists. Bootstrap resolves the Source exactly once and is idempotent
 * afterwards, so a company imported before its Jules profiles were configured keeps every
 * worker paused forever. This repairs that state in place instead of forcing a re-import,
 * which would only create a duplicate company.
 */
export function founderOsRebindService(db: Db, options: { sourceResolver: FounderOsSourceResolver }) {
  async function rebindJulesSource(companyId: string): Promise<FounderOsRebindResult> {
    const empty = { rebound: false, repository: null, source: null, profileId: null, agentsResumed: 0, issuesUnblocked: 0 };
    const company = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1).then((rows) => rows[0]);
    if (!company) throw new Error("Company not found");
    const binding = await db.select().from(companyRepositoryBindings).where(eq(companyRepositoryBindings.companyId, companyId)).limit(1).then((rows) => rows[0]);
    const repository = binding?.repository ?? company.firmGithubRepo ?? null;
    if (!repository) return { ...empty, reason: "Company has no bound GitHub repository" };
    const startingBranch = binding?.defaultBranch ?? "main";

    const resolved = await options.sourceResolver.resolve(repository);
    if (!resolved.accessible || !resolved.source) return { ...empty, repository, reason: resolved.reason ?? "No configured Jules profile exposes this repository", probes: (resolved as { probes?: unknown[] }).probes };

    return db.transaction(async (tx) => {
      const [source] = await tx.insert(companyJulesSources)
        .values({ companyId, repository, source: resolved.source, startingBranch, enabled: true })
        .onConflictDoUpdate({ target: [companyJulesSources.companyId, companyJulesSources.repository], set: { source: resolved.source, startingBranch, enabled: true, updatedAt: new Date() } })
        .returning();
      if (resolved.profileId) await tx.insert(julesProfileSources).values({ profileId: resolved.profileId, companySourceId: source.id, status: "active", verifiedAt: new Date() }).onConflictDoNothing();

      const workers = await tx.select().from(agents).where(and(eq(agents.companyId, companyId), eq(agents.adapterType, "jules")));
      let agentsResumed = 0;
      for (const worker of workers) {
        const { resumable, patch } = julesWorkerRebindPatch(worker, { repository, source: resolved.source, startingBranch });
        if (resumable) agentsResumed += 1;
        await tx.update(agents).set(patch).where(eq(agents.id, worker.id));
      }

      const bootstrap = await tx.select().from(founderosBootstraps).where(and(eq(founderosBootstraps.companyId, companyId), eq(founderosBootstraps.contextVersion, FOUNDEROS_CONTEXT_VERSION))).limit(1).then((rows) => rows[0]);
      const unblockedIssueIds: string[] = [];
      if (bootstrap) {
        const inspection = (bootstrap.seedInspection ?? {}) as Record<string, unknown>;
        // Seed readiness (a missing OVERVIEW.md or website/) is not something a Source can
        // fix, so the bootstrap issue only unblocks when the Source was the whole problem.
        const seedReadiness = !inspection.overviewPresent ? "Missing company/OVERVIEW.md" : !inspection.websitePresent ? "Missing website/ landing-page source" : null;
        const issueId = bootstrap.nativeIds?.issueId;
        if (!seedReadiness && issueId) {
          const issue = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1).then((rows) => rows[0]);
          if (issue?.status === "blocked") { await tx.update(issues).set({ status: "todo", updatedAt: new Date() }).where(eq(issues.id, issueId)); unblockedIssueIds.push(issueId); }
        }
        await tx.update(founderosBootstraps).set({
          status: seedReadiness ? "blocked" : bootstrap.installedCommit ? "awaiting_context_pr" : "ready",
          seedInspection: { ...inspection, companySourceId: source.id, readiness: seedReadiness },
          updatedAt: new Date(),
        }).where(eq(founderosBootstraps.id, bootstrap.id));
      }

      await tx.insert(activityLog).values({ companyId, actorType: "system", actorId: "founderos-rebind", action: "founderos.jules.source.rebound", entityType: "company_jules_source", entityId: source.id, details: { repository, source: resolved.source, profileId: resolved.profileId ?? null, agentsResumed, issuesUnblocked: unblockedIssueIds.length } });

      return { rebound: true, reason: null, repository, source: resolved.source, profileId: resolved.profileId ?? null, agentsResumed, issuesUnblocked: unblockedIssueIds.length, unblockedIssueIds } as FounderOsRebindResult & { unblockedIssueIds: string[] };
    });
  }
  return { rebindJulesSource };
}
