import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { companyJulesSources, julesCapacityEvents, julesProfiles, julesProfileSources, julesRepositoryLeases, julesSessions } from "@paperclipai/db";
import { calculateJulesProfileCapacity, deterministicQueueScore, julesCapacityBroker, resolveJulesExecutionRequirements, writeScopesOverlap } from "../services/jules-capacity-broker.js";

const now = new Date("2026-09-14T12:00:00Z");
const start = (hoursAgo: number, companyId = "company-a") => ({ eventType: "session_started", occurredAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000), companyId });

describe("Jules capacity accounting", () => {
  it("blocks a sixteenth rolling start and restores it only when an event ages out", () => {
    const full = calculateJulesProfileCapacity({ profileId: "p1", sessionStartLimit: 15, sessionStartWindowSec: 86_400, concurrentSessionLimit: 3, reserveSessionStarts: 1, events: Array.from({ length: 15 }, (_, index) => start(index)), activeSessionCount: 0, companyId: "company-a", now });
    expect(full).toMatchObject({ startsInWindow: 15, remainingRollingStarts: 0, remainingConcurrency: 3 });

    const aged = calculateJulesProfileCapacity({ profileId: "p1", sessionStartLimit: 15, sessionStartWindowSec: 86_400, concurrentSessionLimit: 3, reserveSessionStarts: 1, events: [start(25), ...Array.from({ length: 14 }, (_, index) => start(index))], activeSessionCount: 0, companyId: "company-a", now });
    expect(aged).toMatchObject({ startsInWindow: 14, remainingRollingStarts: 1 });
  });

  it("separates concurrency from the persistent rolling-start ledger", () => {
    const events = [start(1), start(2)];
    const active = calculateJulesProfileCapacity({ profileId: "p1", sessionStartLimit: 15, sessionStartWindowSec: 86_400, concurrentSessionLimit: 2, reserveSessionStarts: 1, events, activeSessionCount: 2, companyId: "company-a", now });
    const completed = calculateJulesProfileCapacity({ profileId: "p1", sessionStartLimit: 15, sessionStartWindowSec: 86_400, concurrentSessionLimit: 2, reserveSessionStarts: 1, events, activeSessionCount: 1, companyId: "company-a", now });
    expect(active.remainingConcurrency).toBe(0);
    expect(completed.remainingConcurrency).toBe(1);
    expect(completed.startsInWindow).toBe(2);
  });

  it("derives reserve availability entirely from persisted starts", () => {
    const capacity = calculateJulesProfileCapacity({ profileId: "p1", sessionStartLimit: 5, sessionStartWindowSec: 86_400, concurrentSessionLimit: 3, reserveSessionStarts: 1, events: [start(1), start(2), start(3), start(4)], activeSessionCount: 0, companyId: "company-a", now });
    expect(capacity.remainingRollingStarts).toBe(1);
    expect(capacity.reserveRemaining).toBe(1);
    // Broker admission preserves this last start for authorized urgent work.
    expect(capacity.remainingRollingStarts).toBeLessThanOrEqual(1);
  });
});

describe("Jules repository leases", () => {
  it.each([
    [["website/**"], ["website/landing/**"], true],
    [["firm/**"], ["firm/market/**"], true],
    [["evidence/research/**"], ["website/**"], false],
    [["business-case/MARKET_ANALYSIS.md"], ["business-case/**"], true],
    [["firm/market.firm"], ["firm/market.firm"], true],
    [["firm/market.firm"], ["firm/company.firm"], false],
  ])("compares %j with %j deterministically", (left, right, expected) => {
    expect(writeScopesOverlap(left as string[], right as string[])).toBe(expected);
  });
});

describe("Jules assignment requirements", () => {
  it("derives capabilities and scopes from the native outcome contract without credentials", () => {
    const requirements = resolveJulesExecutionRequirements({ outcomeTemplate: "commitment", env: { JULES_API_KEY: "must-not-appear" } }, { goalSupport: { capabilities: ["context7"] } });
    // Only the operator-set goal requirement is a hard admission gate. The commitment
    // template also declares "linear", but a template capability is advisory now — it
    // renders in the prompt and never denies a dispatch, so it is absent here.
    expect(requirements.requiredCapabilities).toEqual(["context7"]);
    expect(requirements.requiredCapabilities).not.toContain("linear");
    // "firm" stays out regardless: the CLI cannot exist where Jules runs.
    expect(requirements.requiredCapabilities).not.toContain("firm");
    // The write scope still merges the template's paths, so the lease covers the writes.
    expect(requirements.writeScopes).toContain("firm/opportunities.firm");
    expect(JSON.stringify(requirements)).not.toContain("must-not-appear");
  });

  it("provides deterministic starvation and company-value scoring without bypass flags", () => {
    expect(deterministicQueueScore({ company: 2, waitingMinutes: 60 }, 1)).toBeGreaterThan(deterministicQueueScore({ company: 1 }, 1));
  });
});

function brokerDb(profiles: Array<Record<string, unknown>>, options: { sessionsByProfile?: unknown[][]; eventsByProfile?: unknown[][]; leases?: Record<string, unknown>[] } = {}) {
  const leases: Record<string, unknown>[] = [...(options.leases ?? [])];
  let sessionQuery = 0;
  let eventQuery = 0;
  const rowsFor = (table: unknown) => {
    if (table === companyJulesSources) return [{ id: "source-1", companyId: "company-a", repository: "acme/company", source: "sources/acme", startingBranch: "main", enabled: true, requiredCapabilities: [] }];
    if (table === julesProfileSources) return profiles.map((profile) => ({ profileId: profile.id, companySourceId: "source-1", status: "active" }));
    if (table === julesProfiles) return profiles;
    if (table === julesRepositoryLeases) return leases.filter((lease) => !lease.releasedAt);
    if (table === julesCapacityEvents) return options.eventsByProfile?.[eventQuery++] ?? [];
    if (table === julesSessions) return options.sessionsByProfile?.[sessionQuery++] ?? [];
    return [];
  };
  const query = () => {
    let rows: unknown[] = [];
    const chain = {
      from: (table: unknown) => { rows = rowsFor(table); return chain; },
      where: () => chain,
      limit: () => chain,
      then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  };
  const db: Record<string, unknown> = {
    select: query,
    execute: async () => undefined,
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({ where: () => {
      const affected = table === julesRepositoryLeases
        ? leases.filter((lease) => !lease.releasedAt && (!(patch.releasedAt instanceof Date) || !(lease.expiresAt instanceof Date) || lease.expiresAt <= patch.releasedAt))
        : [];
      affected.forEach((row) => Object.assign(row, patch));
      const result = { returning: async () => affected, then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
      return result;
    } }) }),
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
      const row = { id: `lease-${leases.length + 1}`, ...value };
      if (table === julesRepositoryLeases) leases.push(row);
      const result = { returning: async () => [row], onConflictDoNothing: () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
      return result;
    } }),
  };
  db.transaction = (callback: (tx: unknown) => Promise<unknown>) => callback(db);
  return { db: db as unknown as Db, leases };
}

const profile = (id: string, capabilities: string[]) => ({ id, name: id, status: "active", enabled: true, plan: null, secretRef: `secret-${id}`, sessionStartLimit: 15, sessionStartWindowSec: 86_400, concurrentSessionLimit: 2, reserveSessionStarts: 1, capabilities, capabilityReadiness: {}, createdAt: now, updatedAt: now });

describe("persisted broker admission", () => {
  it("selects an alternate capable/source-authorized profile and keeps its credential non-enumerable", async () => {
    const store = brokerDb([profile("busy", ["context7"]), profile("ready", ["context7", "linear"])], { sessionsByProfile: [[{}, {}], []] });
    const resolveSecret = async (_companyId: string, ref: string) => `${ref}-api-key`;
    const result = await julesCapacityBroker(store.db, { resolveSecret }).admit({ companyId: "company-a", paperclipRunId: "run-1", requiredCapabilities: ["context7", "linear"], writeScopes: ["business-case/**"] }, now);
    expect(result).toMatchObject({ kind: "ADMITTED", profileId: "ready", source: "sources/acme", repository: "acme/company" });
    expect(store.leases).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("api-key");
    if (result.kind === "ADMITTED") expect(result.apiKey).toBe("secret-ready-api-key");
  });

  it("denies missing capability before lease acquisition or remote creation", async () => {
    const store = brokerDb([profile("basic", ["context7"])]);
    const createRemote = vi.fn();
    const result = await julesCapacityBroker(store.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "run-2", requiredCapabilities: ["stitch"], writeScopes: ["website/**"] }, now);
    if (result.kind === "ADMITTED") await createRemote();
    expect(result).toMatchObject({ kind: "DENIED", code: "CAPABILITY_MISSING" });
    expect(store.leases).toHaveLength(0);
    expect(createRemote).not.toHaveBeenCalled();
  });

  it("skips a profile with an inaccessible secret and selects another eligible profile", async () => {
    const store = brokerDb([profile("missing-secret", ["linear"]), profile("ready", ["linear"])], { sessionsByProfile: [[], []] });
    const result = await julesCapacityBroker(store.db, { resolveSecret: async (_companyId, ref) => {
      if (ref === "secret-missing-secret") throw new Error("secret unavailable");
      return "runtime-only";
    } }).admit({ companyId: "company-a", paperclipRunId: "run-secret", requiredCapabilities: ["linear"], writeScopes: ["business-case/**"] }, now);
    expect(result).toMatchObject({ kind: "ADMITTED", profileId: "ready" });
    expect(JSON.stringify(result)).not.toContain("runtime-only");
  });

  it("blocks overlapping active leases but permits a non-overlapping configured burst", async () => {
    const activeLease = { id: "existing", companyId: "company-a", profileId: "ready", repository: "acme/company", writeScopes: ["business-case/**"], expiresAt: new Date(now.getTime() + 60_000), releasedAt: null, sessionId: "session-1" };
    const blockedStore = brokerDb([profile("ready", ["context7"])], { leases: [activeLease] });
    const blocked = await julesCapacityBroker(blockedStore.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "run-blocked", requiredCapabilities: ["context7"], writeScopes: ["business-case/MARKET_ANALYSIS.md"] }, now);
    expect(blocked).toMatchObject({ kind: "DENIED", code: "WRITE_SCOPE_CONFLICT" });

    const burstStore = brokerDb([profile("ready", ["context7"])], { leases: [{ ...activeLease, writeScopes: ["evidence/research/**"] }] });
    const admitted = await julesCapacityBroker(burstStore.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "run-burst", requiredCapabilities: ["context7"], writeScopes: ["website/**"] }, now);
    expect(admitted.kind).toBe("ADMITTED");
    expect(burstStore.leases).toHaveLength(2);
  });

  it("recovers stale unbound lease reservations idempotently after restart", async () => {
    const store = brokerDb([profile("ready", [])], { leases: [{ id: "stale", paperclipRunId: "old-run", expiresAt: new Date(now.getTime() - 1), releasedAt: null, sessionId: null }] });
    const firstProcess = julesCapacityBroker(store.db, { resolveSecret: async () => "secret" });
    expect(await firstProcess.recoverStaleLeases(now)).toHaveLength(1);
    const afterRestart = julesCapacityBroker(store.db, { resolveSecret: async () => "secret" });
    expect(await afterRestart.recoverStaleLeases(now)).toHaveLength(0);
  });

  it("preserves reserve for normal work and admits deterministically authorized urgent work", async () => {
    const persistedStarts = Array.from({ length: 14 }, (_, index) => start(index));
    const normalStore = brokerDb([profile("ready", [])], { eventsByProfile: [persistedStarts] });
    const normal = await julesCapacityBroker(normalStore.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "normal", requiredCapabilities: [], writeScopes: ["website/**"] }, now);
    expect(normal).toMatchObject({ kind: "DENIED", code: "RESERVE_ONLY" });

    const urgentStore = brokerDb([profile("ready", [])], { eventsByProfile: [persistedStarts] });
    const urgent = await julesCapacityBroker(urgentStore.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "urgent", requiredCapabilities: [], writeScopes: ["website/**"], urgent: true }, now);
    expect(urgent.kind).toBe("ADMITTED");
  });

  it("uses persisted rolling events after restart and admits only after an event ages out", async () => {
    const blockedStore = brokerDb([profile("ready", [])], { eventsByProfile: [Array.from({ length: 15 }, (_, index) => start(index))] });
    const blocked = await julesCapacityBroker(blockedStore.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "blocked", requiredCapabilities: [], writeScopes: ["website/**"], urgent: true }, now);
    expect(blocked).toMatchObject({ kind: "DENIED", code: "QUOTA_EXHAUSTED" });

    const restartedStore = brokerDb([profile("ready", [])], { eventsByProfile: [[start(25), ...Array.from({ length: 14 }, (_, index) => start(index))]] });
    const restored = await julesCapacityBroker(restartedStore.db, { resolveSecret: async () => "secret" }).admit({ companyId: "company-a", paperclipRunId: "restored", requiredCapabilities: [], writeScopes: ["website/**"], urgent: true }, now);
    expect(restored.kind).toBe("ADMITTED");
  });
});
