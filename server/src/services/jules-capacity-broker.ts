import { and, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { JULES_OUTCOME_TEMPLATES, type JulesSessionSpec } from "@paperclipai/adapter-jules";
import type { Db } from "@paperclipai/db";
import {
  companyJulesSources,
  julesCapacityEvents,
  julesProfiles,
  julesProfileSources,
  julesRepositoryLeases,
  julesSessions,
} from "@paperclipai/db";
import type { JulesAdmissionCode } from "@paperclipai/shared";
import { secretService } from "./secrets.js";

const ACTIVE_SESSION_STATES = ["DISPATCHING", "QUEUED", "PLANNING", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK", "IN_PROGRESS", "PAUSED", "REVISION_REQUESTED"];
const START_EVENTS = ["session_started", "session_retry_started"];
const HEALTHY = "active";

export interface JulesAdmissionRequest {
  companyId: string;
  paperclipRunId: string;
  repository?: string | null;
  issueId?: string | null;
  requiredCapabilities: string[];
  writeScopes: string[];
  urgent?: boolean;
  leaseTtlMs?: number;
  priority?: { company?: number; dependencyUnlock?: number; evidenceRevenue?: number; deadlineUrgency?: number; waitingMinutes?: number; retryCost?: number };
}

export interface JulesProfileCapacity {
  profileId: string;
  startsInWindow: number;
  activeSessions: number;
  remainingRollingStarts: number;
  remainingConcurrency: number;
  reserveRemaining: number;
  sourceAccessible: boolean;
  requiredCapabilitiesPresent: boolean;
  profileHealth: string;
  recentFailures: number;
  companyRecentUsage: number;
  writeConflict: boolean;
}

export function calculateJulesProfileCapacity(input: {
  profileId: string;
  sessionStartLimit: number;
  sessionStartWindowSec: number;
  concurrentSessionLimit: number;
  reserveSessionStarts: number;
  events: Array<{ eventType: string; occurredAt: Date; companyId: string }>;
  activeSessionCount: number;
  activeReservationCount?: number;
  companyId: string;
  now: Date;
  sourceAccessible?: boolean;
  requiredCapabilitiesPresent?: boolean;
  profileHealth?: string;
  writeConflict?: boolean;
}): JulesProfileCapacity {
  const windowStart = input.now.getTime() - input.sessionStartWindowSec * 1000;
  const events = input.events.filter((event) => event.occurredAt.getTime() >= windowStart && event.occurredAt.getTime() <= input.now.getTime());
  const startsInWindow = events.filter((event) => START_EVENTS.includes(event.eventType)).length;
  const activeSessions = input.activeSessionCount + (input.activeReservationCount ?? 0);
  return {
    profileId: input.profileId,
    startsInWindow,
    activeSessions,
    remainingRollingStarts: Math.max(0, input.sessionStartLimit - startsInWindow),
    remainingConcurrency: Math.max(0, input.concurrentSessionLimit - activeSessions),
    reserveRemaining: Math.max(0, input.reserveSessionStarts - Math.max(0, startsInWindow - (input.sessionStartLimit - input.reserveSessionStarts))),
    sourceAccessible: input.sourceAccessible ?? true,
    requiredCapabilitiesPresent: input.requiredCapabilitiesPresent ?? true,
    profileHealth: input.profileHealth ?? HEALTHY,
    recentFailures: events.filter((event) => event.eventType === "session_failed" || event.eventType === "session_orphaned").length,
    companyRecentUsage: events.filter((event) => START_EVENTS.includes(event.eventType) && event.companyId === input.companyId).length,
    writeConflict: input.writeConflict ?? false,
  };
}

export type JulesAdmission = {
  kind: "ADMITTED";
  profileId: string;
  companySourceId: string;
  source: string;
  repository: string;
  startingBranch: string;
  apiKey: string;
  leaseId: string;
  writeScopes: string[];
  capacity: JulesProfileCapacity;
  score: number;
} | {
  kind: "DENIED";
  code: JulesAdmissionCode;
  reason: string;
  capacities: JulesProfileCapacity[];
};

function normalizeScope(value: string): string {
  return value.trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
}

function scopeRoot(scope: string): { prefix: string; recursive: boolean } {
  const normalized = normalizeScope(scope);
  const wildcard = normalized.search(/[?*[]/);
  if (wildcard < 0) return { prefix: normalized, recursive: false };
  return { prefix: normalized.slice(0, wildcard).replace(/\/$/, ""), recursive: true };
}

export function writeScopesOverlap(left: string[], right: string[]): boolean {
  return left.some((leftScope) => right.some((rightScope) => {
    const a = scopeRoot(leftScope);
    const b = scopeRoot(rightScope);
    if (!a.prefix || !b.prefix) return true;
    if (!a.recursive && !b.recursive) return a.prefix === b.prefix;
    const contains = (parent: string, child: string) => child === parent || child.startsWith(`${parent}/`);
    return (a.recursive && contains(a.prefix, b.prefix)) || (b.recursive && contains(b.prefix, a.prefix));
  }));
}

export function deterministicQueueScore(input: NonNullable<JulesAdmissionRequest["priority"]> = {}, companyRecentUsage = 0): number {
  return (input.company ?? 0) * 100
    + (input.dependencyUnlock ?? 0) * 40
    + (input.evidenceRevenue ?? 0) * 30
    + (input.deadlineUrgency ?? 0) * 20
    + Math.min(24 * 60, input.waitingMinutes ?? 0)
    - (input.retryCost ?? 0) * 25
    - companyRecentUsage * 5;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

/**
 * `firm` is a Paperclip-side build, not something a remote worker can hold.
 *
 * The CLI cannot be installed where Jules runs, and Paperclip runs the real build on
 * its own side after a candidate lands. Nearly every FounderOS goal template declares
 * `requiredCapabilities: ["firm"]`, which is true of the goal and false of the worker:
 * left in, it denied every Jules dispatch against a catalog goal with
 * CAPABILITY_MISSING, permanently and for a reason no profile could ever satisfy.
 */
const NEVER_REQUIRED_OF_JULES = new Set(["firm"]);

export function resolveJulesExecutionRequirements(config: Record<string, unknown>, context: Record<string, unknown>) {
  const sessionSpec = config.sessionSpec && typeof config.sessionSpec === "object" ? config.sessionSpec as Partial<JulesSessionSpec> : null;
  const templateId = typeof config.outcomeTemplate === "string" ? config.outcomeTemplate : "";
  const template = JULES_OUTCOME_TEMPLATES[templateId as keyof typeof JULES_OUTCOME_TEMPLATES];
  const support = context.goalSupport && typeof context.goalSupport === "object" ? context.goalSupport as Record<string, unknown> : {};
  return {
    requiredCapabilities: [...new Set([...strings(sessionSpec?.capabilities), ...strings(template?.capabilities), ...strings(support.capabilities)])].filter((capability) => !NEVER_REQUIRED_OF_JULES.has(capability)),
    writeScopes: [...new Set([...strings(sessionSpec?.writeScope), ...strings(template?.writeScope), ...strings(config.writeScopes)])],
  };
}

function denial(code: JulesAdmissionCode, reason: string, capacities: JulesProfileCapacity[]): JulesAdmission {
  return { kind: "DENIED", code, reason, capacities };
}

export function julesCapacityBroker(db: Db, options: { resolveSecret?: (companyId: string, secretRef: string) => Promise<string> } = {}) {
  const secrets = secretService(db);

  async function recoverStaleLeases(now = new Date()) {
    return db.update(julesRepositoryLeases).set({ releasedAt: now })
      .where(and(isNull(julesRepositoryLeases.releasedAt), isNull(julesRepositoryLeases.sessionId), lte(julesRepositoryLeases.expiresAt, now))).returning();
  }

  async function releaseAdmission(paperclipRunId: string, now = new Date()) {
    return db.update(julesRepositoryLeases).set({ releasedAt: now })
      .where(and(eq(julesRepositoryLeases.paperclipRunId, paperclipRunId), isNull(julesRepositoryLeases.releasedAt))).returning();
  }

  async function bindSession(paperclipRunId: string, sessionId: string) {
    return db.update(julesRepositoryLeases).set({ sessionId })
      .where(eq(julesRepositoryLeases.paperclipRunId, paperclipRunId)).returning();
  }

  async function admit(request: JulesAdmissionRequest, now = new Date()): Promise<JulesAdmission> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('paperclip:jules-capacity-broker'))`);
      await tx.update(julesRepositoryLeases).set({ releasedAt: now })
        .where(and(isNull(julesRepositoryLeases.releasedAt), isNull(julesRepositoryLeases.sessionId), lte(julesRepositoryLeases.expiresAt, now)));

      if (request.issueId) {
        const existing = await tx.select({ id: julesSessions.id }).from(julesSessions).where(and(
          eq(julesSessions.companyId, request.companyId),
          eq(julesSessions.issueId, request.issueId),
          inArray(julesSessions.status, ACTIVE_SESSION_STATES),
        )).limit(1);
        if (existing[0]) return denial("NO_PROFILE_AVAILABLE", "This native Paperclip issue already has active Jules execution", []);
      }

      const sources = await tx.select().from(companyJulesSources).where(and(
        eq(companyJulesSources.companyId, request.companyId),
        eq(companyJulesSources.enabled, true),
      ));
      sources.sort((a, b) => a.repository.localeCompare(b.repository) || a.id.localeCompare(b.id));
      const source = request.repository ? sources.find((item) => item.repository === request.repository) : sources[0];
      if (!source) return denial("SOURCE_ACCESS_MISSING", "Company has no enabled Jules source for the requested repository", []);
      const requiredCapabilities = [...new Set([...request.requiredCapabilities, ...source.requiredCapabilities])];

      const mappings = await tx.select().from(julesProfileSources).where(and(
        eq(julesProfileSources.companySourceId, source.id),
        eq(julesProfileSources.status, "active"),
      ));
      if (!mappings.length) return denial("SOURCE_ACCESS_MISSING", "No Jules profile is verified for the company source", []);
      const profileIds = mappings.map((item) => item.profileId);
      const profiles = await tx.select().from(julesProfiles).where(inArray(julesProfiles.id, profileIds));
      const activeLeases = await tx.select().from(julesRepositoryLeases).where(and(
        eq(julesRepositoryLeases.companyId, request.companyId),
        eq(julesRepositoryLeases.repository, source.repository),
        isNull(julesRepositoryLeases.releasedAt),
        gt(julesRepositoryLeases.expiresAt, now),
      ));
      const writeConflict = activeLeases.some((lease) => writeScopesOverlap(request.writeScopes, lease.writeScopes));
      const burstLimit = Math.max(1, Number(process.env.JULES_COMPANY_WRITE_BURST || 2));
      if (writeConflict || activeLeases.length >= burstLimit) {
        return denial("WRITE_SCOPE_CONFLICT", writeConflict ? "An active Jules lease overlaps the requested write scope" : "Company repository write concurrency is exhausted", []);
      }

      const capacities: JulesProfileCapacity[] = [];
      const eligible: Array<{ profile: typeof julesProfiles.$inferSelect; capacity: JulesProfileCapacity; apiKey: string }> = [];
      for (const profile of profiles) {
        const windowStart = new Date(now.getTime() - profile.sessionStartWindowSec * 1000);
        const events = await tx.select().from(julesCapacityEvents).where(and(eq(julesCapacityEvents.profileId, profile.id), gte(julesCapacityEvents.occurredAt, windowStart), lte(julesCapacityEvents.occurredAt, now)));
        const sessions = await tx.select().from(julesSessions).where(and(eq(julesSessions.profileId, profile.id), inArray(julesSessions.status, ACTIVE_SESSION_STATES)));
        const reservations = activeLeases.filter((lease) => lease.profileId === profile.id && !lease.sessionId).length;
        const readiness = profile.capabilityReadiness ?? {};
        const requiredCapabilitiesPresent = requiredCapabilities.every((capability) => profile.capabilities.includes(capability) && !["missing", "error"].includes(readiness[capability]?.status ?? "configured"));
        const capacity = calculateJulesProfileCapacity({
          profileId: profile.id,
          sessionStartLimit: profile.sessionStartLimit,
          sessionStartWindowSec: profile.sessionStartWindowSec,
          concurrentSessionLimit: profile.concurrentSessionLimit,
          reserveSessionStarts: profile.reserveSessionStarts,
          events,
          activeSessionCount: sessions.length,
          activeReservationCount: reservations,
          companyId: request.companyId,
          now,
          requiredCapabilitiesPresent,
          profileHealth: profile.status,
        });
        capacities.push(capacity);
        if (!profile.enabled || !requiredCapabilitiesPresent || capacity.remainingConcurrency <= 0 || capacity.remainingRollingStarts <= 0 || (!request.urgent && capacity.remainingRollingStarts <= profile.reserveSessionStarts)) continue;
        if (![HEALTHY, "auth_required"].includes(profile.status.toLowerCase())) continue;
        try {
          const apiKey = await (options.resolveSecret
            ? options.resolveSecret(request.companyId, profile.secretRef)
            : secrets.resolveSecretValue(request.companyId, profile.secretRef, "latest"));
          if (!apiKey.trim()) throw new Error("empty Jules credential");
          if (profile.status.toLowerCase() === "auth_required") {
            await tx.update(julesProfiles).set({ status: HEALTHY, updatedAt: now }).where(eq(julesProfiles.id, profile.id));
            await tx.insert(julesCapacityEvents).values({ profileId: profile.id, companyId: request.companyId, eventType: "profile_restored", occurredAt: now, details: { reason: "credential_available" } });
            capacity.profileHealth = HEALTHY;
          }
          eligible.push({ profile, capacity, apiKey });
        } catch {
          await tx.update(julesProfiles).set({ status: "auth_required", updatedAt: now }).where(eq(julesProfiles.id, profile.id));
          await tx.insert(julesCapacityEvents).values({ profileId: profile.id, companyId: request.companyId, eventType: "profile_degraded", occurredAt: now, details: { reason: "credential_unavailable" } }).onConflictDoNothing();
          capacity.profileHealth = "auth_required";
        }
      }

      if (!eligible.length) {
        const capable = capacities.filter((item) => item.requiredCapabilitiesPresent);
        if (!capable.length) return denial("CAPABILITY_MISSING", "No source-authorized profile has every required verified capability", capacities);
        if (capable.every((item) => item.profileHealth === "auth_required")) return denial("AUTH_REQUIRED", "No eligible profile has an accessible credential", capacities);
        const healthy = capable.filter((item) => item.profileHealth === HEALTHY);
        if (!healthy.length) return denial("PROFILE_DEGRADED", "All matching profiles are degraded, cooling down, or disabled", capacities);
        if (healthy.every((item) => item.remainingConcurrency <= 0)) return denial("CONCURRENCY_EXHAUSTED", "All eligible profiles are at their concurrency limit", capacities);
        const concurrent = healthy.filter((item) => item.remainingConcurrency > 0);
        if (concurrent.every((item) => item.remainingRollingStarts <= 0)) return denial("QUOTA_EXHAUSTED", "Rolling Jules start quota is exhausted", capacities);
        if (!request.urgent && concurrent.every((item) => item.remainingRollingStarts <= profiles.find((profile) => profile.id === item.profileId)!.reserveSessionStarts)) return denial("RESERVE_ONLY", "Only reserved Jules starts remain", capacities);
        return denial("NO_PROFILE_AVAILABLE", "No Jules profile is eligible", capacities);
      }

      eligible.sort((a, b) => (a.capacity.startsInWindow / a.profile.sessionStartLimit) - (b.capacity.startsInWindow / b.profile.sessionStartLimit)
        || a.capacity.activeSessions - b.capacity.activeSessions
        || a.capacity.companyRecentUsage - b.capacity.companyRecentUsage
        || a.profile.id.localeCompare(b.profile.id));
      const selected = eligible[0];
      const [lease] = await tx.insert(julesRepositoryLeases).values({
        companyId: request.companyId,
        profileId: selected.profile.id,
        paperclipRunId: request.paperclipRunId,
        repository: source.repository,
        writeScopes: request.writeScopes,
        acquiredAt: now,
        expiresAt: new Date(now.getTime() + (request.leaseTtlMs ?? 6 * 60 * 60 * 1000)),
      }).returning();
      const admission = {
        kind: "ADMITTED",
        profileId: selected.profile.id,
        companySourceId: source.id,
        source: source.source,
        repository: source.repository,
        startingBranch: source.startingBranch,
        leaseId: lease.id,
        writeScopes: request.writeScopes,
        capacity: selected.capacity,
        score: deterministicQueueScore(request.priority, selected.capacity.companyRecentUsage),
      } as Omit<Extract<JulesAdmission, { kind: "ADMITTED" }>, "apiKey"> & { apiKey?: string };
      Object.defineProperty(admission, "apiKey", { value: selected.apiKey, enumerable: false, writable: false });
      return admission as Extract<JulesAdmission, { kind: "ADMITTED" }>;
    });
  }

  return { admit, bindSession, releaseAdmission, recoverStaleLeases };
}
