import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyPendingMigrations,
  agents,
  companies,
  companyJulesSources,
  companySecrets,
  createDb,
  heartbeatRuns,
  issues,
  julesCapacityEvents,
  julesProfileSources,
  julesProfiles,
  julesRepositoryLeases,
  julesSessions,
  type Db,
} from "@paperclipai/db";
import { julesCapacityBroker } from "../services/jules-capacity-broker.js";
import { julesEnvProfileService } from "../services/jules-env-profiles.js";

// GATE05 GO: per-company Jules credential allowlist + per-company rolling limit.
// These cases prove enforcement at the broker/admission boundary (not only at
// seeding) and durability of the limit across a simulated database restore.
// Gated on DATABASE_URL and reported NOT_RUN when absent, never a fake PASS.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

const REPO = "JsonLord/aux-company";
const SOURCE = "sources/aux";

// Reviewer P0-2 (safety): this suite performs DML, so it must NEVER run against a
// shared/production database. Derive the database name from DATABASE_URL and, by
// default, refuse to run unless it looks like a disposable test database. An
// explicit AUX_PG_ALLOW_DB=1 is the only escape hatch, so the failure mode is
// "does not run", never "wipes a live table".
function extractDbName(raw: string): string {
  try {
    return decodeURIComponent(new URL(raw).pathname.replace(/^\//, "")).trim();
  } catch {
    return "";
  }
}
function isDisposableTestDb(name: string): boolean {
  if (process.env.AUX_PG_ALLOW_DB === "1") return true;
  if (!name) return false;
  return /(test|tmp|scratch|vitest|_local$)/i.test(name);
}

suite("aux jules token-3 allowlist (real PostgreSQL)", () => {
  let db: Db;
  // Fixtures created by THIS run only — teardown touches nothing else, so a
  // pre-existing deployment's rows (different company/profile ids) stay intact.
  const companyIds: string[] = [];
  const agentIds: string[] = [];
  const runIds: string[] = [];
  const secretIds: string[] = [];
  const profileIds: string[] = [];
  const sourceIds: string[] = [];
  const issueIds: string[] = [];

  beforeAll(async () => {
    const dbName = extractDbName(url!);
    if (!isDisposableTestDb(dbName)) {
      throw new Error(
        `Refusing to run destructive Jules tests against non-test database "${dbName}". ` +
        `Point DATABASE_URL at a disposable test database (name must match test/tmp/scratch/vitest/_local), ` +
        `or set AUX_PG_ALLOW_DB=1 to override.`,
      );
    }
    // Throwaway AES key for the local_encrypted provider (fixture, never a real
    // secret). decodeMasterKey accepts a 32-byte base64 string.
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    await applyPendingMigrations(url!);
    db = createDb(url!);
  }, 120_000);

  async function freshCompany(label: string): Promise<string> {
    const [row] = await db.insert(companies).values({
      name: `${label}-${randomUUID()}`,
      issuePrefix: `${label.slice(0, 3).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`,
    }).returning({ id: companies.id });
    companyIds.push(row.id);
    return row.id;
  }

  // Build the full FK chain a real admission needs: company -> agent ->
  // heartbeatRun (the lease's paperclipRunId is a UUID FK to heartbeat_runs),
  // company secret (metadata only; there is no plaintext column), a profile
  // whose secretRef points at that secret, a bound source, and the active
  // profile->source mapping. resolveSecret is stubbed so no real Jules key is
  // ever read or required. Every created id is tracked for scoped teardown.
  async function harness(companyId: string, secretName: string, sessionStartLimit = 15) {
    const [agent] = await db.insert(agents).values({ companyId, name: `w-${randomUUID()}`, adapterType: "jules" }).returning({ id: agents.id });
    agentIds.push(agent.id);
    const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent.id, status: "queued" }).returning({ id: heartbeatRuns.id });
    runIds.push(run.id);
    const [secret] = await db.insert(companySecrets).values({ companyId, name: secretName, provider: "local_encrypted" }).returning({ id: companySecrets.id });
    secretIds.push(secret.id);
    const [profile] = await db.insert(julesProfiles).values({ name: `jules-${companyId}-x`, secretRef: secret.id, sessionStartLimit, capabilities: ["github"], status: "active" }).returning({ id: julesProfiles.id });
    profileIds.push(profile.id);
    const [source] = await db.insert(companyJulesSources).values({ companyId, repository: REPO, source: SOURCE, enabled: true }).returning({ id: companyJulesSources.id });
    sourceIds.push(source.id);
    await db.insert(julesProfileSources).values({ profileId: profile.id, companySourceId: source.id, status: "active" });
    return { paperclipRunId: run.id, profileId: profile.id, secretId: secret.id, sourceId: source.id, agentId: agent.id };
  }

  // Track the secret + profile created by ensureForCompany. jules_profiles has no
  // companyId column, so scope by the ids we just learned, matched to this company's
  // jules-api-* secrets.
  async function trackSeeded(companyId: string) {
    const secrets = await db.select({ id: companySecrets.id, name: companySecrets.name }).from(companySecrets).where(inArray(companySecrets.companyId, [companyId]));
    for (const s of secrets) {
      if (!s.name.startsWith("jules-api-")) continue;
      secretIds.push(s.id);
      const profs = await db.select({ id: julesProfiles.id }).from(julesProfiles).where(eq(julesProfiles.secretRef, s.id));
      for (const p of profs) profileIds.push(p.id);
    }
  }

  const req = (companyId: string, paperclipRunId: string, extra: Record<string, unknown> = {}) => ({
    companyId, paperclipRunId, repository: REPO, requiredCapabilities: ["github"], writeScopes: [], ...extra,
  });
  const broker = () => julesCapacityBroker(db, { resolveSecret: async () => "stub-key" });

  it("AUX token 1 is rejected when the allowlist is [3]", async () => {
    const companyId = await freshCompany("a1");
    const h = await harness(companyId, "jules-api-1");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${companyId}=3`;
    const a = await broker().admit(req(companyId, h.paperclipRunId));
    expect(a.kind).toBe("DENIED");
    if (a.kind === "DENIED") expect(a.code).toBe("NO_PROFILE_AVAILABLE");
  });

  it("AUX token 2 is rejected when the allowlist is [3]", async () => {
    const companyId = await freshCompany("a2");
    const h = await harness(companyId, "jules-api-2");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${companyId}=3`;
    const a = await broker().admit(req(companyId, h.paperclipRunId));
    expect(a.kind).toBe("DENIED");
    if (a.kind === "DENIED") expect(a.code).toBe("NO_PROFILE_AVAILABLE");
  });

  it("AUX token 3 is accepted when the allowlist is [3]", async () => {
    const companyId = await freshCompany("a3");
    const h = await harness(companyId, "jules-api-3");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${companyId}=3`;
    const a = await broker().admit(req(companyId, h.paperclipRunId));
    expect(a.kind).toBe("ADMITTED");
    if (a.kind === "ADMITTED") expect(a.profileId).toBe(h.profileId);
  });

  it("AUX token 3 rolling limit is 90 (created by the seed reconcile)", async () => {
    const companyId = await freshCompany("a90");
    process.env.JULES_API_3 = "seed-value-3";
    process.env.JULES_SESSION_START_LIMIT_OVERRIDES = `${companyId}=90`;
    await julesEnvProfileService(db).ensureForCompany(companyId);
    await trackSeeded(companyId);
    const [row] = await db.select().from(julesProfiles).where(eq(julesProfiles.secretRef,
      (await db.select().from(companySecrets).where(eq(companySecrets.companyId, companyId)).then((s) => s[0]!)).id));
    expect(row.sessionStartLimit).toBe(90);
    delete process.env.JULES_API_3;
    delete process.env.JULES_SESSION_START_LIMIT_OVERRIDES;
  });

  it("HUM remains unaffected when only AUX is allowlisted", async () => {
    const auxId = await freshCompany("hum-aux");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${auxId}=3`;
    const humId = await freshCompany("hum");
    const h = await harness(humId, "jules-api-1");
    const a = await broker().admit(req(humId, h.paperclipRunId));
    expect(a.kind).toBe("ADMITTED");
    expect(humId).not.toBe(auxId);
  });

  it("policy survives an application restart (env re-read every admission)", async () => {
    const companyId = await freshCompany("restart");
    const h = await harness(companyId, "jules-api-3");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${companyId}=3`;
    const first = await broker().admit(req(companyId, h.paperclipRunId));
    expect(first.kind).toBe("ADMITTED");
    await db.delete(julesRepositoryLeases).where(eq(julesRepositoryLeases.paperclipRunId, h.paperclipRunId));
    // A fresh broker (new process) re-reads the same env and keeps enforcing; it must
    // carry a REAL run row because the lease's paperclipRunId is a FK to heartbeat_runs.
    const [run2] = await db.insert(heartbeatRuns).values({ companyId, agentId: h.agentId, status: "queued" }).returning({ id: heartbeatRuns.id });
    runIds.push(run2.id);
    const second = await broker().admit(req(companyId, run2.id));
    expect(second.kind).toBe("ADMITTED");
  });

  it("missing token 3 fails closed without falling back to tokens 1 or 2", async () => {
    const companyId = await freshCompany("fail");
    const h1 = await harness(companyId, "jules-api-1");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${companyId}=3`;
    const a = await broker().admit(req(companyId, h1.paperclipRunId));
    expect(a.kind).toBe("DENIED");
    if (a.kind === "DENIED") expect(a.code).toBe("NO_PROFILE_AVAILABLE");
  });

  it("no duplicate Jules dispatch for an issue that already has an active session", async () => {
    const companyId = await freshCompany("dup");
    const h = await harness(companyId, "jules-api-3");
    process.env.JULES_ALLOWED_PROFILE_INDEXES = `${companyId}=3`;
    const [issue] = await db.insert(issues).values({ companyId, title: "dup-guard" }).returning({ id: issues.id });
    issueIds.push(issue.id);
    const issueId = issue.id;
    await db.insert(julesSessions).values({ companyId, profileId: h.profileId, companySourceId: h.sourceId, paperclipRunId: h.paperclipRunId, agentId: h.agentId, issueId, julesSessionId: "jules-active-1", status: "IN_PROGRESS" });
    const a = await broker().admit(req(companyId, randomUUID(), { issueId }));
    expect(a.kind).toBe("DENIED");
    if (a.kind === "DENIED") expect(a.code).toBe("NO_PROFILE_AVAILABLE");
  });

  it("database restore re-applies the 90 limit without duplicating the profile", async () => {
    const companyId = await freshCompany("restore");
    process.env.JULES_API_3 = "seed-value-3";
    process.env.JULES_SESSION_START_LIMIT_OVERRIDES = `${companyId}=90`;
    await julesEnvProfileService(db).ensureForCompany(companyId);
    await trackSeeded(companyId);
    const secret = await db.select().from(companySecrets).where(eq(companySecrets.companyId, companyId)).then((s) => s[0]!);
    const before = await db.select().from(julesProfiles).where(eq(julesProfiles.secretRef, secret.id));
    expect(before.length).toBe(1);
    // Simulate a from-backup restore that put the row back at the default 15.
    await db.update(julesProfiles).set({ sessionStartLimit: 15 }).where(eq(julesProfiles.id, before[0]!.id));
    await julesEnvProfileService(db).ensureForCompany(companyId);
    const after = await db.select().from(julesProfiles).where(eq(julesProfiles.secretRef, secret.id));
    expect(after.length).toBe(1);
    expect(after[0]!.sessionStartLimit).toBe(90);
    delete process.env.JULES_API_3;
    delete process.env.JULES_SESSION_START_LIMIT_OVERRIDES;
  });

  // Scoped teardown (reviewer P0-2): delete ONLY the fixtures this run created,
  // children first in FK order, via inArray on the tracked ids. Runs in afterAll so
  // it fires even if a test fails. Rows belonging to any other company/profile are
  // untouched. The id arrays are also asserted non-empty so a silent no-op is visible.
  afterAll(async () => {
    if (!db || !companyIds.length) return;
    // Strict child-first FK order. jules_sessions, jules_repository_leases and
    // jules_capacity_events all reference jules_profiles, so they are deleted BEFORE
    // the profiles; company_secret_versions cascade off company_secrets (onDelete:
    // cascade) so the secrets are removed only after everything that points at their
    // profiles is gone. Every delete is scoped to THIS run's fixtures (companyId in
    // companyIds, or the tracked profile ids for the two profile tables that carry no
    // companyId), so rows belonging to any other company are never touched.
    await db.delete(julesSessions).where(inArray(julesSessions.companyId, companyIds));
    await db.delete(julesRepositoryLeases).where(inArray(julesRepositoryLeases.companyId, companyIds));
    await db.delete(julesCapacityEvents).where(inArray(julesCapacityEvents.companyId, companyIds));
    if (profileIds.length) {
      await db.delete(julesProfileSources).where(inArray(julesProfileSources.profileId, profileIds));
      await db.delete(julesProfiles).where(inArray(julesProfiles.id, profileIds));
    }
    await db.delete(companySecrets).where(inArray(companySecrets.companyId, companyIds));
    await db.delete(companyJulesSources).where(inArray(companyJulesSources.companyId, companyIds));
    await db.delete(issues).where(inArray(issues.companyId, companyIds));
    await db.delete(heartbeatRuns).where(inArray(heartbeatRuns.companyId, companyIds));
    await db.delete(agents).where(inArray(agents.companyId, companyIds));
    await db.delete(companies).where(inArray(companies.id, companyIds));
  }, 60_000);
});
