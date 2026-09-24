import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { companySecretVersions, companySecrets, julesProfiles } from "@paperclipai/db";
import { julesEnvProfileService } from "../services/jules-env-profiles.js";
import { fakeDb } from "./fixtures/fake-db.js";

const ENV = ["JULES_API_1", "JULES_API_2", "JULES_SESSION_START_LIMIT", "JULES_SEED_ROTATE"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  vi.restoreAllMocks();
});

describe("jules env profiles", () => {
  it("does nothing when no JULES_API_* key is present", async () => {
    delete process.env.JULES_API_1; delete process.env.JULES_API_2;
    const store = fakeDb();
    const result = await julesEnvProfileService(store.db).ensureForCompany("company-1");
    expect(result).toMatchObject({ created: 0, profileIds: [] });
    expect(store.rows.get(julesProfiles) ?? []).toHaveLength(0);
  });

  it("imports each key as a company secret and one profile per key", async () => {
    process.env.JULES_API_1 = "key-one";
    process.env.JULES_API_2 = "key-two";
    const store = fakeDb();
    const result = await julesEnvProfileService(store.db).ensureForCompany("company-1");
    expect(result.created).toBe(2);
    expect(result.profileIds).toHaveLength(2);

    const secrets = store.rows.get(companySecrets) ?? [];
    expect(secrets.map((s) => s.name).sort()).toEqual(["jules-api-1", "jules-api-2"]);
    expect(secrets.every((s) => s.companyId === "company-1")).toBe(true);
    expect(JSON.stringify(secrets)).not.toContain("key-one");
    expect(JSON.stringify(secrets)).not.toContain("key-two");

    const profiles = store.rows.get(julesProfiles) ?? [];
    expect(profiles.map((p) => p.name).sort()).toEqual(["jules-company-1-1", "jules-company-1-2"]);
    expect(profiles.every((p) => p.sessionStartLimit === 15 && p.sessionStartWindowSec === 86_400)).toBe(true);
    // each profile points at a secret that exists for this company
    const secretIds = new Set(secrets.map((s) => s.id));
    expect(profiles.every((p) => secretIds.has(p.secretRef))).toBe(true);
  });

  it("is idempotent — a second import reuses profiles instead of duplicating", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    const first = await svc.ensureForCompany("company-1");
    const second = await svc.ensureForCompany("company-1");
    expect(first.created).toBe(1);
    expect(second).toMatchObject({ created: 0, reused: 1 });
    expect(second.profileIds).toEqual(first.profileIds);
    expect(store.rows.get(julesProfiles) ?? []).toHaveLength(1);
  });

  it("scopes profile names per company so two companies never share one", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    await svc.ensureForCompany("company-2");
    const profiles = store.rows.get(julesProfiles) ?? [];
    expect(profiles.map((p) => p.name).sort()).toEqual(["jules-company-1-1", "jules-company-2-1"]);
    // Each company gets its own secret, so the two profiles can never resolve to one key.
    expect(new Set(profiles.map((p) => p.secretRef)).size).toBe(2);
  });

  it("adopts a profile that already points at this company's key, whatever it is named", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    const first = await svc.ensureForCompany("company-1");
    // An earlier deployment named profiles after a truncated company id.
    (store.rows.get(julesProfiles) ?? [])[0].name = "jules-company-1";
    const second = await svc.ensureForCompany("company-1");
    expect(second).toMatchObject({ created: 0, reused: 1 });
    expect(second.profileIds).toEqual(first.profileIds);
    expect(store.rows.get(julesProfiles) ?? []).toHaveLength(1);
  });

  it("rotates an existing key only when asked to", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    const versions = () => (store.rows.get(companySecretVersions) ?? []).length;
    const afterCreate = versions();

    delete process.env.JULES_SEED_ROTATE;
    expect(await svc.ensureForCompany("company-1")).toMatchObject({ rotated: 0 });
    expect(versions()).toBe(afterCreate);

    process.env.JULES_SEED_ROTATE = "true";
    expect(await svc.ensureForCompany("company-1")).toMatchObject({ rotated: 1, created: 0, reused: 1 });
    expect(versions()).toBeGreaterThan(afterCreate);
  });

  it("honours a configured session start limit", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_API_2;
    process.env.JULES_SESSION_START_LIMIT = "7";
    const store = fakeDb();
    await julesEnvProfileService(store.db).ensureForCompany("company-1");
    expect((store.rows.get(julesProfiles) ?? [])[0].sessionStartLimit).toBe(7);
  });
});
