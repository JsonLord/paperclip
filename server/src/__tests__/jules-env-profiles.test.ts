import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  companySecretVersions,
  companySecrets,
  julesProfiles,
} from "@paperclipai/db";
import {
  julesEnvProfileService,
  readJulesEnvironmentProfiles,
} from "../services/jules-env-profiles.js";
import { fakeDb } from "./fixtures/fake-db.js";

const ENV = [
  "JULES_API_1",
  "JULES_API_2",
  "JULES_API_90",
  "JULES_SESSION_START_LIMIT",
  "JULES_SEED_ROTATE",
  "JULES_SESSION_WINDOW_SEC",
  "JULES_CONCURRENT_SESSION_LIMIT",
  "JULES_SESSION_START_LIMIT_1",
  "JULES_SESSION_START_LIMIT_2",
  "JULES_SESSION_START_LIMIT_90",
  "JULES_CONCURRENT_SESSION_LIMIT_1",
  "JULES_CONCURRENT_SESSION_LIMIT_2",
  "JULES_CONCURRENT_SESSION_LIMIT_90",
] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  vi.restoreAllMocks();
});

describe("jules env profiles", () => {
  it("does nothing when no JULES_API_* key is present", async () => {
    delete process.env.JULES_API_1;
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const result = await julesEnvProfileService(store.db).ensureForCompany(
      "company-1",
    );
    expect(result).toMatchObject({ created: 0, profileIds: [] });
    expect(store.rows.get(julesProfiles) ?? []).toHaveLength(0);
  });

  it("imports each key as a company secret and one profile per key", async () => {
    process.env.JULES_API_1 = "key-one";
    process.env.JULES_API_2 = "key-two";
    const store = fakeDb();
    const result = await julesEnvProfileService(store.db).ensureForCompany(
      "company-1",
    );
    expect(result.created).toBe(2);
    expect(result.profileIds).toHaveLength(2);

    const secrets = store.rows.get(companySecrets) ?? [];
    expect(secrets.map((s) => s.name).sort()).toEqual([
      "jules-api-1",
      "jules-api-2",
    ]);
    expect(secrets.every((s) => s.companyId === "company-1")).toBe(true);
    expect(JSON.stringify(secrets)).not.toContain("key-one");
    expect(JSON.stringify(secrets)).not.toContain("key-two");

    const profiles = store.rows.get(julesProfiles) ?? [];
    expect(profiles.map((p) => p.name).sort()).toEqual([
      "jules-company-1-1",
      "jules-company-1-2",
    ]);
    expect(
      profiles.every(
        (p) => p.sessionStartLimit === 15 && p.sessionStartWindowSec === 86_400,
      ),
    ).toBe(true);
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
    expect(profiles.map((p) => p.name).sort()).toEqual([
      "jules-company-1-1",
      "jules-company-2-1",
    ]);
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

  it("re-seals a secret this deployment can no longer decrypt", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_API_2;
    delete process.env.JULES_SEED_ROTATE;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    const versionsBefore = (store.rows.get(companySecretVersions) ?? []).length;

    // A master key lost with the ephemeral disk: the row is there, it just cannot be read.
    const secrets = await import("../services/secrets.js");
    const spy = vi.spyOn(secrets, "secretService");
    const real = (
      secrets.secretService as unknown as (
        db: unknown,
      ) => Record<string, unknown>
    )(store.db);
    spy.mockReturnValue({
      ...real,
      resolveSecretValue: async () => {
        throw new Error("Unsupported state or unable to authenticate data");
      },
    } as never);

    const healed = await julesEnvProfileService(store.db).ensureForCompany(
      "company-1",
    );
    expect(healed).toMatchObject({
      created: 0,
      reused: 1,
      rotated: 1,
      unreadable: 1,
    });
    expect(
      (store.rows.get(companySecretVersions) ?? []).length,
    ).toBeGreaterThan(versionsBefore);
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
    expect(await svc.ensureForCompany("company-1")).toMatchObject({
      rotated: 0,
    });
    expect(versions()).toBe(afterCreate);

    process.env.JULES_SEED_ROTATE = "true";
    expect(await svc.ensureForCompany("company-1")).toMatchObject({
      rotated: 1,
      created: 0,
      reused: 1,
    });
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

  it("discovers key 90 without treating its suffix as a quota", () => {
    const profiles = readJulesEnvironmentProfiles({
      JULES_API_90: "test-paid",
      JULES_API_2: "test-two",
      JULES_API_1: "test-one",
      JULES_API_0: "ignored",
      JULES_API_90_URL: "ignored",
      JULES_API_3: " ",
    });
    expect(profiles.map((p) => p.index)).toEqual([1, 2, 90]);
    expect(profiles.every((p) => Object.keys(p.limits).length === 0)).toBe(
      true,
    );
  });

  it("configures the three requested profiles with independent daily and concurrent limits", async () => {
    process.env.JULES_API_1 = "test-one";
    process.env.JULES_API_2 = "test-two";
    process.env.JULES_API_90 = "test-paid";
    for (const index of [1, 2, 90]) {
      process.env[`JULES_SESSION_START_LIMIT_${index}`] =
        index === 90 ? "90" : "10";
      process.env[`JULES_CONCURRENT_SESSION_LIMIT_${index}`] =
        index === 90 ? "90" : "3";
    }
    const store = fakeDb();
    await julesEnvProfileService(store.db).ensureForCompany("company-1");
    const profiles = store.rows.get(julesProfiles) ?? [];
    expect(profiles).toHaveLength(3);
    for (const index of [1, 2, 90]) {
      expect(
        profiles.find((p) => p.name === `jules-company-1-${index}`),
      ).toMatchObject({
        sessionStartLimit: index === 90 ? 90 : 10,
        concurrentSessionLimit: index === 90 ? 90 : 3,
        sessionStartWindowSec: 86400,
      });
    }
  });

  it("gives per-key settings precedence over global settings", () => {
    const [profile] = readJulesEnvironmentProfiles({
      JULES_API_90: "test-paid",
      JULES_SESSION_START_LIMIT: "10",
      JULES_CONCURRENT_SESSION_LIMIT: "3",
      JULES_SESSION_START_LIMIT_90: "90",
      JULES_CONCURRENT_SESSION_LIMIT_90: "90",
    });
    expect(profile.limits).toEqual({
      sessionStartLimit: 90,
      concurrentSessionLimit: 90,
    });
  });

  it.each(["0", "-1", "NaN", "Infinity", "3.5", "2147483648"])(
    "rejects invalid quota %s before any secret write",
    async (value) => {
      process.env.JULES_API_1 = "test-one";
      process.env.JULES_SESSION_START_LIMIT_1 = value;
      const store = fakeDb();
      await expect(
        julesEnvProfileService(store.db).ensureForCompany("company-1"),
      ).rejects.toThrow(
        "JULES_SESSION_START_LIMIT_1 must be a positive PostgreSQL integer",
      );
      expect(store.rows.get(companySecrets) ?? []).toHaveLength(0);
      expect(store.rows.get(companySecretVersions) ?? []).toHaveLength(0);
      expect(store.rows.get(julesProfiles) ?? []).toHaveLength(0);
    },
  );

  it("updates managed quotas in place without resetting ids, health, or secret versions", async () => {
    process.env.JULES_API_1 = "test-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    const first = await svc.ensureForCompany("company-1");
    const profile = store.rows.get(julesProfiles)![0];
    profile.status = "auth_required";
    profile.enabled = false;
    const versions = (store.rows.get(companySecretVersions) ?? []).length;
    process.env.JULES_SESSION_START_LIMIT_1 = "10";
    process.env.JULES_CONCURRENT_SESSION_LIMIT_1 = "3";
    const second = await svc.ensureForCompany("company-1");
    expect(second.profileIds).toEqual(first.profileIds);
    expect(store.rows.get(julesProfiles)).toHaveLength(1);
    expect(profile).toMatchObject({
      sessionStartLimit: 10,
      concurrentSessionLimit: 3,
      status: "auth_required",
      enabled: false,
    });
    expect((store.rows.get(companySecretVersions) ?? []).length).toBe(versions);
  });

  it("preserves manually set quotas when environment limits are absent", async () => {
    process.env.JULES_API_1 = "test-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    const profile = store.rows.get(julesProfiles)![0];
    Object.assign(profile, {
      sessionStartLimit: 29,
      concurrentSessionLimit: 7,
    });
    await svc.ensureForCompany("company-1");
    expect(profile).toMatchObject({
      sessionStartLimit: 29,
      concurrentSessionLimit: 7,
    });
  });

  it("does not update another company's profile when applying managed quotas", async () => {
    process.env.JULES_API_1 = "test-one";
    delete process.env.JULES_API_2;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    await svc.ensureForCompany("company-2");
    process.env.JULES_SESSION_START_LIMIT_1 = "10";
    await svc.ensureForCompany("company-1");
    const profiles = store.rows.get(julesProfiles)!;
    expect(
      profiles.find((p) => p.name === "jules-company-1-1")!.sessionStartLimit,
    ).toBe(10);
    expect(
      profiles.find((p) => p.name === "jules-company-2-1")!.sessionStartLimit,
    ).toBe(15);
  });
});
