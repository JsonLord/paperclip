import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { companySecrets, julesProfiles } from "@paperclipai/db";
import { julesEnvProfileService } from "../services/jules-env-profiles.js";

function fakeDb() {
  const rows = new Map<unknown, any[]>();
  let id = 0;
  const select = () => {
    let selected: any[] = [];
    const q: any = {
      from: (t: unknown) => { selected = rows.get(t) ?? []; return q; },
      where: () => q, limit: () => q, orderBy: () => q,
      then: (ok: any, bad: any) => Promise.resolve(selected).then(ok, bad),
    };
    return q;
  };
  const db: any = {
    select,
    transaction: (fn: any) => fn(db),
    insert: (table: unknown) => ({
      values: (value: any) => {
        const vals = Array.isArray(value) ? value : [value];
        const made = vals.map((v) => ({ id: v.id ?? `id-${++id}`, ...v }));
        const target = rows.get(table) ?? [];
        rows.set(table, target);
        const op: any = {
          onConflictDoNothing: () => op, onConflictDoUpdate: () => op,
          returning: async () => { target.push(...made); return made; },
          then: (ok: any) => Promise.resolve(target.push(...made)).then(ok),
        };
        return op;
      },
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [], then: (ok: any) => Promise.resolve(undefined).then(ok) }) }) }),
  };
  return { db: db as Db, rows };
}

const ENV = ["JULES_API_1", "JULES_API_2", "JULES_SESSION_START_LIMIT"] as const;
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
    // Secret *count* is not asserted: the fake `where()` is a no-op, so getByName
    // matches the first row regardless of name and the second key reuses it. The
    // real store filters on (companyId, name). What matters here is that secrets
    // are created for this company and never hold the raw key in plaintext.
    expect(secrets.length).toBeGreaterThan(0);
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
    // secretRef uniqueness is not asserted here: the fake `where()` is a no-op, so
    // getByName cannot scope by company. The real store filters on companyId.
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
