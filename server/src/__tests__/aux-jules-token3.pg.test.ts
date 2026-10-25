import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyPendingMigrations,
  agents,
  companies,
  companyJulesSources,
  companySecrets,
  createDb,
  heartbeatRuns,
  issues,
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

suite("aux jules token-3 allowlist (real PostgreSQL)", () => {
  let db: Db;
  beforeAll(async () => {
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
    return row.id;
  }

  // Build the full FK chain a real admission needs: company -> agent ->
  // heartbeatRun (the lease's paperclipRunId is a UUID FK to heartbeat_runs),
  // company secret (metadata only; there is no plaintext column), a profile
  // whose secretRef points at that secret, a bound source, and the active
  // profile->source mapping. resolveSecret is stubbed so no real Jules key is
  // ever read or required.
  async function harness(companyId: string, secretName: string, sessionStartLimit = 15) {
    const [agent] = await db.insert(agents).values({ companyId, name: `w-${randomUUID()}`, adapterType: "jules" }).returning({ id: agents.id });
    const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent.id, status: "queued" }).returning({ id: heartbeatRuns.id });
    const [secret] = await db.insert(companySecrets).values({ companyId, name: secretName, provider: "local_encrypted" }).returning({ id: companySecrets.id });
    const [profile] = await db.insert(julesProfiles).values({ name: `jules-${companyId}-x`, secretRef: secret.id, sessionStartLimit, capabilities: ["github"], status: "active" }).returning({ id: julesProfiles.id });
    const [source] = await db.insert(companyJulesSources).values({ companyId, repository: REPO, source: SOURCE, enabled: true }).returning({ id: companyJulesSources.id });
    await db.insert(julesProfileSources).values({ profileId: profile.id, companySourceId: source.id, status: "active" });
    return { paperclipRunId: run.id, profileId: profile.id, secretId: secret.id, sourceId: source.id, agentId: agent.id };
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

  it("cleanup: removes test rows", async () => {
    await db.delete(issues);
    await db.delete(julesSessions);
    await db.delete(julesProfileSources);
    await db.delete(julesRepositoryLeases);
    await db.delete(companyJulesSources);
    await db.delete(julesProfiles);
    await db.delete(companySecrets);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });
});
