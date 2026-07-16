/**
 * Database-aware orchestration for the Firm integration (see `firm.ts`).
 *
 * Two entry points:
 *  - {@link onProjectCreated}: lazily initializes a company's Firm workspace
 *    and links the new project, then renders an initial snapshot. Called
 *    fire-and-forget from project creation so it never blocks or fails the
 *    request.
 *  - {@link tickDailySync}: invoked by the scheduler; re-renders snapshots for
 *    initialized companies whose snapshot has aged past `maxAgeMs` (one day by
 *    default), so the warm context "constantly updates after a day".
 */
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { firmService, FIRM_DEFAULT_MAX_AGE_MS } from "./firm.js";

export interface FirmDailySyncResult {
  considered: number;
  synced: number;
  skipped: number;
  failed: number;
}

export function firmSyncService(db: Db) {
  const firm = firmService();

  return {
    firm,

    /**
     * Initialize the company workspace, link the project, and render an
     * initial snapshot. Safe to call repeatedly; swallows all errors.
     */
    onProjectCreated: async (input: {
      companyId: string;
      projectId: string;
      projectName: string;
      repoUrl?: string | null;
      companyName?: string | null;
    }): Promise<void> => {
      try {
        let companyName = input.companyName ?? null;
        if (!companyName) {
          companyName = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, input.companyId))
            .then((rows) => rows[0]?.name ?? null);
        }
        await firm.ensureWorkspace(input.companyId, companyName);
        await firm.linkProject({
          companyId: input.companyId,
          projectId: input.projectId,
          name: input.projectName,
          repoUrl: input.repoUrl ?? null,
        });
        await firm.writeSnapshot(input.companyId);
      } catch (err) {
        logger.warn(
          { err, companyId: input.companyId, projectId: input.projectId },
          "firm: onProjectCreated failed",
        );
      }
    },

    /**
     * Re-render snapshots for initialized companies whose snapshot has gone
     * stale. Companies that no longer exist or are archived are skipped (and
     * their workspaces left in place).
     */
    tickDailySync: async (
      now: Date = new Date(),
      opts: { maxAgeMs?: number } = {},
    ): Promise<FirmDailySyncResult> => {
      const maxAgeMs = opts.maxAgeMs ?? FIRM_DEFAULT_MAX_AGE_MS;
      const result: FirmDailySyncResult = { considered: 0, synced: 0, skipped: 0, failed: 0 };

      const initializedIds = await firm.listInitializedCompanyIds();
      if (initializedIds.length === 0) return result;

      const activeRows = await db
        .select({ id: companies.id })
        .from(companies)
        .where(inArray(companies.id, initializedIds));
      const activeIds = new Set(activeRows.map((row) => row.id));

      for (const companyId of initializedIds) {
        result.considered += 1;
        if (!activeIds.has(companyId)) {
          result.skipped += 1;
          continue;
        }
        if (!(await firm.isStale(companyId, maxAgeMs, now.getTime()))) {
          result.skipped += 1;
          continue;
        }
        try {
          await firm.writeSnapshot(companyId);
          result.synced += 1;
        } catch (err) {
          result.failed += 1;
          logger.warn({ err, companyId }, "firm: daily snapshot sync failed");
        }
      }

      return result;
    },
  };
}

export type FirmSyncService = ReturnType<typeof firmSyncService>;
