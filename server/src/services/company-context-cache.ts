/**
 * Per-company warm context cache.
 *
 * Resolving an agent's company context (Firm business graph, skills, MCP
 * config) on every heartbeat means a cold read on each run — and a cold read
 * every time the server process moves to another host. This cache keeps the
 * rendered, ready-to-inject context resident in memory, keyed by company, so
 * switching the active company (or waking an agent in a different company)
 * does not pay the full resolution cost again.
 *
 * Entries are scoped twice: by `companyId` and then by a free-form `scopeKey`
 * (e.g. a projectId, or {@link COMPANY_SCOPE_KEY} for company-wide context).
 * This keeps one company's context strictly isolated from another's — evicting
 * company A never touches company B.
 *
 * The cache is write-through: producers (see `firm.ts`) call {@link set} when
 * they render fresh context, and consumers (the heartbeat run path) call
 * {@link getOrLoad} for a warm-first read with a lazy fallback loader.
 */

/** Scope key used for context that applies to the whole company (no project). */
export const COMPANY_SCOPE_KEY = "__company__";

export interface WarmContextEntry {
  /** Rendered, ready-to-inject content. `null` means "known to be empty". */
  content: string | null;
  /** Source revision/identifier the content was rendered from, if any. */
  sourceRef: string | null;
  /** Epoch milliseconds when this entry was generated. */
  generatedAt: number;
}

interface CacheStats {
  companies: number;
  entries: number;
  hits: number;
  misses: number;
}

export class CompanyContextCache {
  private readonly store = new Map<string, Map<string, WarmContextEntry>>();
  private hits = 0;
  private misses = 0;

  private normalizeScope(scopeKey?: string | null): string {
    const trimmed = scopeKey?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : COMPANY_SCOPE_KEY;
  }

  /** Read a cached entry without recording a hit/miss. Returns `undefined` on miss. */
  peek(companyId: string, scopeKey?: string | null): WarmContextEntry | undefined {
    return this.store.get(companyId)?.get(this.normalizeScope(scopeKey));
  }

  /** Read a cached entry, recording a hit/miss for {@link stats}. */
  get(companyId: string, scopeKey?: string | null): WarmContextEntry | undefined {
    const entry = this.peek(companyId, scopeKey);
    if (entry) this.hits += 1;
    else this.misses += 1;
    return entry;
  }

  /** True when a cached entry exists and is younger than `maxAgeMs`. */
  isFresh(companyId: string, scopeKey: string | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
    const entry = this.peek(companyId, scopeKey);
    if (!entry) return false;
    return now - entry.generatedAt < maxAgeMs;
  }

  set(companyId: string, scopeKey: string | null | undefined, entry: WarmContextEntry): void {
    let byScope = this.store.get(companyId);
    if (!byScope) {
      byScope = new Map();
      this.store.set(companyId, byScope);
    }
    byScope.set(this.normalizeScope(scopeKey), entry);
  }

  /** Evict every entry for a single company (e.g. on company archive/delete). */
  invalidateCompany(companyId: string): void {
    this.store.delete(companyId);
  }

  /** Evict a single scope within a company. */
  invalidateScope(companyId: string, scopeKey?: string | null): void {
    this.store.get(companyId)?.delete(this.normalizeScope(scopeKey));
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Warm-first read. Returns the cached entry when it is younger than
   * `maxAgeMs`; otherwise invokes `loader`, stores the result, and returns it.
   *
   * A `loader` that returns `null` is treated as "no context available" and is
   * NOT cached, so a transient miss does not get pinned for `maxAgeMs`.
   */
  async getOrLoad(
    companyId: string,
    scopeKey: string | null | undefined,
    maxAgeMs: number,
    loader: () => Promise<WarmContextEntry | null>,
    now = Date.now(),
  ): Promise<WarmContextEntry | null> {
    if (this.isFresh(companyId, scopeKey, maxAgeMs, now)) {
      this.hits += 1;
      return this.peek(companyId, scopeKey) ?? null;
    }
    this.misses += 1;
    const loaded = await loader();
    if (loaded) this.set(companyId, scopeKey, loaded);
    return loaded;
  }

  stats(): CacheStats {
    let entries = 0;
    for (const byScope of this.store.values()) entries += byScope.size;
    return { companies: this.store.size, entries, hits: this.hits, misses: this.misses };
  }
}

/**
 * Process-wide singleton. The warm cache is intentionally per-process state,
 * not per-`Db`-handle, so every service constructed in a process shares it.
 */
export const companyContextCache = new CompanyContextCache();
