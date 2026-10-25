import { afterEach, describe, expect, it } from "vitest";
import { julesProfiles } from "@paperclipai/db";
import { julesEnvProfileService } from "../services/jules-env-profiles.js";
import { fakeDb } from "./fixtures/fake-db.js";

const ENV = ["JULES_API_1", "JULES_PROFILE_CAPABILITIES"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

describe("what a profile seeded from the environment declares it can do", () => {
  it("always claims github, because a bound source is github access", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_PROFILE_CAPABILITIES;
    const store = fakeDb();
    await julesEnvProfileService(store.db).ensureForCompany("company-1");
    // An empty list denies every dispatch that asks for anything at all.
    expect((store.rows.get(julesProfiles) ?? [])[0].capabilities).toEqual(["github"]);
  });

  it("adds the MCP servers the deployment says are configured in Jules", async () => {
    process.env.JULES_API_1 = "key-one";
    process.env.JULES_PROFILE_CAPABILITIES = " Context7 ,linear,, tinybird ";
    const store = fakeDb();
    await julesEnvProfileService(store.db).ensureForCompany("company-1");
    expect((store.rows.get(julesProfiles) ?? [])[0].capabilities).toEqual(["github", "context7", "linear", "tinybird"]);
  });

  it("widens a profile seeded before capabilities were declared", async () => {
    process.env.JULES_API_1 = "key-one";
    delete process.env.JULES_PROFILE_CAPABILITIES;
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    store.rows.get(julesProfiles)![0].capabilities = [];

    process.env.JULES_PROFILE_CAPABILITIES = "context7";
    await svc.ensureForCompany("company-1");
    expect((store.rows.get(julesProfiles) ?? [])[0].capabilities).toEqual(["github", "context7"]);
  });

  it("never narrows one that was granted more elsewhere", async () => {
    process.env.JULES_API_1 = "key-one";
    process.env.JULES_PROFILE_CAPABILITIES = "context7";
    const store = fakeDb();
    const svc = julesEnvProfileService(store.db);
    await svc.ensureForCompany("company-1");
    store.rows.get(julesProfiles)![0].capabilities = ["github", "context7", "stitch"];

    delete process.env.JULES_PROFILE_CAPABILITIES;
    await svc.ensureForCompany("company-1");
    expect((store.rows.get(julesProfiles) ?? [])[0].capabilities).toEqual(["github", "context7", "stitch"]);
  });
});
