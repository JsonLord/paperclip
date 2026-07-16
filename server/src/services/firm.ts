/**
 * Firm integration — keeps a per-company reference of the company's "business
 * graph" (organizations, people, projects, relationships) sourced from the
 * Firm project (https://github.com/42futures/firm), a business-as-code tool
 * that stores everything as version-controlled plain text.
 *
 * Design (see also `company-context-cache.ts`):
 *
 *  - Each company gets an isolated Firm workspace on disk under the Paperclip
 *    instance root: `<instance>/firm/<companyId>/`. Per-company directories
 *    keep one company's business data strictly separate from another's.
 *  - A workspace is initialized lazily, per project, the first time a project
 *    is created (see `firmSyncService.onProjectCreated`).
 *  - A rendered, ready-to-inject `context.md` snapshot is regenerated on a
 *    daily cadence by the scheduler (see `firmSyncService.tickDailySync`) and
 *    cached warm in {@link companyContextCache}, so agent runs read it without
 *    paying a cold render — including after the server moves hosts.
 *  - The `firm` CLI is used when present; when it is absent the service
 *    degrades gracefully by rendering the snapshot from the plain-text files
 *    in the workspace (which is exactly Firm's own storage model). The agent
 *    run path therefore never depends on the CLI being installed.
 *
 * Nothing here throws into the agent run path: every public read returns
 * `null`/safe defaults on failure and logs instead.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { logger } from "../middleware/logger.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { companyContextCache, COMPANY_SCOPE_KEY, type WarmContextEntry } from "./company-context-cache.js";

const execFileAsync = promisify(execFile);

/** Default snapshot freshness window — re-sync once a day. */
export const FIRM_DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How much rendered context to inject, at most, to bound prompt size. */
const MAX_CONTEXT_CHARS = 16_000;

const PATH_SEGMENT_RE = /[^a-zA-Z0-9._-]+/g;

function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = value.trim().replace(PATH_SEGMENT_RE, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function firmCliCommand(): string {
  return process.env.PAPERCLIP_FIRM_CLI?.trim() || "firm";
}

/** Root directory holding every company's Firm workspace. */
export function firmHomeDir(): string {
  const override = process.env.PAPERCLIP_FIRM_HOME?.trim();
  if (override) return path.resolve(override);
  return path.resolve(resolvePaperclipInstanceRoot(), "firm");
}

export function companyFirmDir(companyId: string): string {
  return path.resolve(firmHomeDir(), sanitizeSegment(companyId, "company"));
}

export interface WorkspaceMeta {
  companyId: string;
  companyName: string | null;
  createdAt: string;
  cliInitialized: boolean;
}

export interface SnapshotMeta {
  generatedAt: string;
  sourceRef: string | null;
  cliUsed: boolean;
  projectCount: number;
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  repoUrl: string | null;
  linkedAt: string;
}

let cachedCliDetection: { available: boolean; version: string | null } | null = null;

/**
 * Filesystem + cache layer. Does not depend on the database, so it is safe to
 * use from the agent run path for warm reads.
 */
export function firmService() {
  function workspaceMetaPath(companyId: string) {
    return path.join(companyFirmDir(companyId), "workspace.json");
  }
  function snapshotMetaPath(companyId: string) {
    return path.join(companyFirmDir(companyId), "snapshot.json");
  }
  function contextPath(companyId: string) {
    return path.join(companyFirmDir(companyId), "context.md");
  }
  function projectsDir(companyId: string) {
    return path.join(companyFirmDir(companyId), "projects");
  }

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fsp.readFile(file, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  async function writeJson(file: string, value: unknown): Promise<void> {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  /** Detect the `firm` CLI once per process. */
  async function detectCli(force = false): Promise<{ available: boolean; version: string | null }> {
    if (cachedCliDetection && !force) return cachedCliDetection;
    try {
      const { stdout } = await execFileAsync(firmCliCommand(), ["--version"], { timeout: 5_000 });
      cachedCliDetection = { available: true, version: stdout.trim() || null };
    } catch {
      cachedCliDetection = { available: false, version: null };
    }
    return cachedCliDetection;
  }

  async function isInitialized(companyId: string): Promise<boolean> {
    try {
      await fsp.access(workspaceMetaPath(companyId));
      return true;
    } catch {
      return false;
    }
  }

  /** Ensure the company's Firm workspace exists on disk. Idempotent. */
  async function ensureWorkspace(companyId: string, companyName?: string | null): Promise<WorkspaceMeta> {
    const dir = companyFirmDir(companyId);
    await fsp.mkdir(projectsDir(companyId), { recursive: true });

    const existing = await readJson<WorkspaceMeta>(workspaceMetaPath(companyId));
    if (existing) {
      if (companyName && existing.companyName !== companyName) {
        const updated = { ...existing, companyName };
        await writeJson(workspaceMetaPath(companyId), updated);
        return updated;
      }
      return existing;
    }

    let cliInitialized = false;
    const cli = await detectCli();
    if (cli.available) {
      try {
        await execFileAsync(firmCliCommand(), ["init"], { cwd: dir, timeout: 30_000 });
        cliInitialized = true;
      } catch (err) {
        logger.warn({ err, companyId }, "firm: `firm init` failed; using plain-text workspace fallback");
      }
    }

    const meta: WorkspaceMeta = {
      companyId,
      companyName: companyName ?? null,
      createdAt: new Date().toISOString(),
      cliInitialized,
    };
    await writeJson(workspaceMetaPath(companyId), meta);
    logger.info({ companyId, cliInitialized }, "firm: initialized company workspace");
    return meta;
  }

  /** Record a project into the company's Firm workspace. Idempotent per projectId. */
  async function linkProject(input: {
    companyId: string;
    projectId: string;
    name: string;
    repoUrl?: string | null;
  }): Promise<void> {
    await ensureWorkspace(input.companyId);
    const file = path.join(projectsDir(input.companyId), `${sanitizeSegment(input.projectId, "project")}.json`);
    const record: ProjectRecord = {
      projectId: input.projectId,
      name: input.name,
      repoUrl: input.repoUrl ?? null,
      linkedAt: (await readJson<ProjectRecord>(file))?.linkedAt ?? new Date().toISOString(),
    };
    await writeJson(file, record);
  }

  async function listProjectRecords(companyId: string): Promise<ProjectRecord[]> {
    let names: string[];
    try {
      names = await fsp.readdir(projectsDir(companyId));
    } catch {
      return [];
    }
    const records: ProjectRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const record = await readJson<ProjectRecord>(path.join(projectsDir(companyId), name));
      if (record) records.push(record);
    }
    return records.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Render the company's Firm data into a markdown snapshot. Prefers the
   * `firm` CLI's export; falls back to assembling from the workspace's
   * plain-text records. Returns the markdown and the source ref it came from.
   */
  async function renderContext(companyId: string): Promise<{ markdown: string; sourceRef: string | null; cliUsed: boolean }> {
    const meta = await readJson<WorkspaceMeta>(workspaceMetaPath(companyId));
    const companyName = meta?.companyName ?? null;
    const cli = await detectCli();

    if (cli.available && meta?.cliInitialized) {
      try {
        const { stdout } = await execFileAsync(
          firmCliCommand(),
          ["export", "--format", "markdown"],
          { cwd: companyFirmDir(companyId), timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
        );
        const body = stdout.trim();
        if (body) {
          return { markdown: body.slice(0, MAX_CONTEXT_CHARS), sourceRef: cli.version, cliUsed: true };
        }
      } catch (err) {
        logger.warn({ err, companyId }, "firm: CLI export failed; falling back to plain-text render");
      }
    }

    const projects = await listProjectRecords(companyId);
    const lines: string[] = [];
    lines.push(`This is the current reference of the firm's structure, maintained from Firm (business-as-code).`);
    lines.push("");
    lines.push(`**Company:** ${companyName ?? companyId}`);
    lines.push(`**Projects tracked:** ${projects.length}`);
    if (projects.length > 0) {
      lines.push("");
      lines.push("## Projects");
      for (const project of projects) {
        const repo = project.repoUrl ? ` — ${project.repoUrl}` : "";
        lines.push(`- **${project.name}**${repo}`);
      }
    }
    return { markdown: lines.join("\n").slice(0, MAX_CONTEXT_CHARS), sourceRef: null, cliUsed: false };
  }

  /**
   * Regenerate `context.md` + `snapshot.json` for a company and write the
   * result through to the warm cache. Returns the snapshot metadata.
   */
  async function writeSnapshot(companyId: string): Promise<SnapshotMeta> {
    await ensureWorkspace(companyId);
    const { markdown, sourceRef, cliUsed } = await renderContext(companyId);
    const projectCount = (await listProjectRecords(companyId)).length;
    const generatedAt = new Date();

    await fsp.writeFile(contextPath(companyId), `${markdown}\n`);
    const meta: SnapshotMeta = {
      generatedAt: generatedAt.toISOString(),
      sourceRef,
      cliUsed,
      projectCount,
    };
    await writeJson(snapshotMetaPath(companyId), meta);

    companyContextCache.set(companyId, COMPANY_SCOPE_KEY, {
      content: markdown || null,
      sourceRef,
      generatedAt: generatedAt.getTime(),
    });
    logger.info({ companyId, projectCount, cliUsed }, "firm: refreshed company snapshot");
    return meta;
  }

  /** Read the on-disk snapshot age in ms, or `null` when none exists. */
  async function snapshotAgeMs(companyId: string, now = Date.now()): Promise<number | null> {
    const meta = await readJson<SnapshotMeta>(snapshotMetaPath(companyId));
    if (!meta) return null;
    const ts = Date.parse(meta.generatedAt);
    return Number.isNaN(ts) ? null : now - ts;
  }

  async function isStale(companyId: string, maxAgeMs = FIRM_DEFAULT_MAX_AGE_MS, now = Date.now()): Promise<boolean> {
    const age = await snapshotAgeMs(companyId, now);
    return age === null || age >= maxAgeMs;
  }

  /**
   * Warm-first read of a company's Firm context for injection into an agent
   * run. Cache hit returns immediately; on miss it reads the on-disk snapshot
   * (cheap) and, if stale, kicks a non-blocking re-render so the next run is
   * warm. Never throws — returns `null` when no context is available.
   */
  async function getContext(input: {
    companyId: string;
    maxAgeMs?: number;
    now?: number;
  }): Promise<string | null> {
    const { companyId } = input;
    const maxAgeMs = input.maxAgeMs ?? FIRM_DEFAULT_MAX_AGE_MS;
    const now = input.now ?? Date.now();
    try {
      const cached = companyContextCache.get(companyId, COMPANY_SCOPE_KEY);
      if (cached && now - cached.generatedAt < maxAgeMs) {
        return cached.content;
      }

      // Cold (or stale) cache: hydrate from the on-disk snapshot if present.
      const meta = await readJson<SnapshotMeta>(snapshotMetaPath(companyId));
      if (!meta) return cached?.content ?? null;

      const content = await fsp.readFile(contextPath(companyId), "utf-8").catch(() => null);
      const generatedAt = Date.parse(meta.generatedAt);
      const entry: WarmContextEntry = {
        content: content?.trim() ? content.trim() : null,
        sourceRef: meta.sourceRef,
        generatedAt: Number.isNaN(generatedAt) ? now : generatedAt,
      };
      companyContextCache.set(companyId, COMPANY_SCOPE_KEY, entry);

      // Stale on disk → refresh in the background without blocking the run.
      if (now - entry.generatedAt >= maxAgeMs) {
        setImmediate(() => {
          void writeSnapshot(companyId).catch((err) =>
            logger.warn({ err, companyId }, "firm: background snapshot refresh failed"),
          );
        });
      }
      return entry.content;
    } catch (err) {
      logger.warn({ err, companyId }, "firm: getContext failed");
      return null;
    }
  }

  /** Company ids that have an initialized Firm workspace on disk. */
  async function listInitializedCompanyIds(): Promise<string[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(firmHomeDir(), { withFileTypes: true });
    } catch {
      return [];
    }
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (await isInitialized(entry.name)) ids.push(entry.name);
    }
    return ids;
  }

  return {
    detectCli,
    firmHomeDir,
    companyFirmDir,
    isInitialized,
    ensureWorkspace,
    linkProject,
    listProjectRecords,
    renderContext,
    writeSnapshot,
    snapshotAgeMs,
    isStale,
    getContext,
    listInitializedCompanyIds,
  };
}

export type FirmService = ReturnType<typeof firmService>;
