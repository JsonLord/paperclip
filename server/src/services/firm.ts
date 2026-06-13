import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, firmSnapshots } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

const FIRM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_FIRM_REPO = "42futures/firm";

interface GithubTreeItem {
  path: string;
  type: string;
  url: string;
}

interface GithubCommit {
  sha: string;
  commit: { message: string };
}

async function fetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchRepoTree(repo: string): Promise<{ sha: string; tree: GithubTreeItem[] }> {
  const [owner, name] = repo.split("/");
  const commits = await fetchJson<GithubCommit[]>(
    `https://api.github.com/repos/${owner}/${name}/commits?per_page=1`,
  );
  const sha = commits[0]?.sha ?? "HEAD";
  const tree = await fetchJson<{ sha: string; tree: GithubTreeItem[] }>(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${sha}?recursive=1`,
  );
  return { sha, tree: tree.tree };
}

async function fetchFileContent(repo: string, path: string): Promise<string> {
  const [owner, name] = repo.split("/");
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${name}/main/${path}`);
  if (!res.ok) throw new Error(`raw fetch failed: ${res.status} ${path}`);
  return res.text();
}

async function buildFirmSnapshot(repo: string): Promise<{
  sha: string;
  snapshotJson: Record<string, unknown>;
  contextMarkdown: string;
}> {
  const { sha, tree } = await fetchRepoTree(repo);
  const jsonFiles = tree.filter((f) => f.type === "blob" && f.path?.endsWith(".json"));
  const mdFiles = tree.filter((f) => f.type === "blob" && f.path?.endsWith(".md"));

  const snapshotJson: Record<string, unknown> = { repo, sha, files: {} };
  const contextParts: string[] = [`# Firm Context — ${repo}`, `> Snapshot commit: \`${sha}\``, ""];

  for (const file of jsonFiles.slice(0, 20)) {
    try {
      const text = await fetchFileContent(repo, file.path);
      const parsed = JSON.parse(text);
      (snapshotJson.files as Record<string, unknown>)[file.path] = parsed;
      contextParts.push(`## ${file.path}`, "```json", JSON.stringify(parsed, null, 2), "```", "");
    } catch {
      // skip unparseable files
    }
  }

  for (const file of mdFiles.slice(0, 5)) {
    try {
      const text = await fetchFileContent(repo, file.path);
      contextParts.push(`## ${file.path}`, text, "");
    } catch {
      // skip
    }
  }

  return { sha, snapshotJson, contextMarkdown: contextParts.join("\n") };
}

export function firmService(db: Db) {
  async function markPreviousStale(companyId: string) {
    await db
      .update(firmSnapshots)
      .set({ isLatest: false })
      .where(and(eq(firmSnapshots.companyId, companyId), eq(firmSnapshots.isLatest, true)));
  }

  async function initFirm(companyId: string, repo?: string | null): Promise<void> {
    const resolvedRepo = repo ?? DEFAULT_FIRM_REPO;
    logger.info({ companyId, repo: resolvedRepo }, "firm: initializing");
    try {
      const { sha, snapshotJson, contextMarkdown } = await buildFirmSnapshot(resolvedRepo);
      await markPreviousStale(companyId);
      await db.insert(firmSnapshots).values({
        companyId,
        sourceRepo: resolvedRepo,
        commitSha: sha,
        snapshotJson,
        contextMarkdown,
        isLatest: true,
        fetchedAt: new Date(),
      });
      await db
        .update(companies)
        .set({ firmLastRefreshedAt: new Date(), firmGithubRepo: resolvedRepo })
        .where(eq(companies.id, companyId));
      logger.info({ companyId, sha }, "firm: initialized");
    } catch (err) {
      logger.error({ companyId, err }, "firm: init failed");
    }
  }

  async function refreshFirm(companyId: string): Promise<void> {
    const company = await db
      .select({ firmGithubRepo: companies.firmGithubRepo, firmLastRefreshedAt: companies.firmLastRefreshedAt })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);

    if (!company) return;
    const repo = company.firmGithubRepo ?? DEFAULT_FIRM_REPO;

    logger.info({ companyId, repo }, "firm: refreshing");
    try {
      const { sha, snapshotJson, contextMarkdown } = await buildFirmSnapshot(repo);
      const latest = await db
        .select({ commitSha: firmSnapshots.commitSha })
        .from(firmSnapshots)
        .where(and(eq(firmSnapshots.companyId, companyId), eq(firmSnapshots.isLatest, true)))
        .orderBy(desc(firmSnapshots.fetchedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (latest?.commitSha === sha) {
        // No new commits — just update the refresh timestamp
        await db.update(companies).set({ firmLastRefreshedAt: new Date() }).where(eq(companies.id, companyId));
        logger.info({ companyId, sha }, "firm: no changes since last snapshot");
        return;
      }

      await markPreviousStale(companyId);
      await db.insert(firmSnapshots).values({
        companyId,
        sourceRepo: repo,
        commitSha: sha,
        snapshotJson,
        contextMarkdown,
        isLatest: true,
        fetchedAt: new Date(),
      });
      await db.update(companies).set({ firmLastRefreshedAt: new Date() }).where(eq(companies.id, companyId));
      logger.info({ companyId, sha }, "firm: refreshed");
    } catch (err) {
      logger.error({ companyId, err }, "firm: refresh failed");
    }
  }

  async function getLatestSnapshot(companyId: string) {
    return db
      .select()
      .from(firmSnapshots)
      .where(and(eq(firmSnapshots.companyId, companyId), eq(firmSnapshots.isLatest, true)))
      .orderBy(desc(firmSnapshots.fetchedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async function refreshStale(): Promise<void> {
    const staleCompanies = await db
      .select({ id: companies.id, firmGithubRepo: companies.firmGithubRepo, firmLastRefreshedAt: companies.firmLastRefreshedAt })
      .from(companies)
      .where(eq(companies.status, "active"));

    const cutoff = new Date(Date.now() - FIRM_REFRESH_INTERVAL_MS);
    for (const company of staleCompanies) {
      const needsRefresh =
        company.firmGithubRepo !== null &&
        (company.firmLastRefreshedAt === null || company.firmLastRefreshedAt < cutoff);
      if (needsRefresh) {
        await refreshFirm(company.id);
      }
    }
  }

  return { initFirm, refreshFirm, getLatestSnapshot, refreshStale };
}

let _firmRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function startFirmRefreshScheduler(db: Db): void {
  if (_firmRefreshTimer) return;
  const svc = firmService(db);
  // Run once shortly after startup, then every hour (actual staleness check is 24h)
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  const runCheck = () => {
    void svc.refreshStale().catch((err) => {
      logger.error({ err }, "firm: scheduled refresh check failed");
    });
  };
  setTimeout(runCheck, 30_000);
  _firmRefreshTimer = setInterval(runCheck, CHECK_INTERVAL_MS);
}
