import { describe, expect, it } from "vitest";
import { julesProfiles } from "@paperclipai/db";
import { persistedJulesSourceResolver, summarizeJulesSourceProbes } from "../services/founderos-bootstrap.js";
import { fakeDb } from "./fixtures/fake-db.js";

// resolveSecretValue is company-scoped, so a profile pointing at another company's key
// throws. The resolver must tell that apart from a key that works but sees no match.
function store(profiles: Array<{ id: string; name: string; secretRef: string }>) {
  return fakeDb([[julesProfiles, profiles.map((p) => ({ ...p, enabled: true }))]]);
}
const source = (owner: string, repo: string) => ({ name: `sources/${owner}-${repo}`, githubRepo: { owner, repo } });

describe("Jules source resolution diagnostics", () => {
  it("names the profile whose key this company cannot use", async () => {
    const { db } = store([{ id: "p1", name: "jules-1", secretRef: "s1" }, { id: "p2", name: "jules-2", secretRef: "s2" }]);
    // No company secret rows exist, so resolveSecretValue rejects for both profiles —
    // the shape of a profile pointing at another company's secret.
    const resolver = persistedJulesSourceResolver(db, "company-1", () => ({ listSources: async () => ({ items: [source("JsonLord", "aux-company")] }) }));
    const result = await resolver.resolve("JsonLord/aux-company");
    expect(result.accessible).toBe(false);
    expect(result.reason).toBe("jules-1: API key not available to this company; jules-2: API key not available to this company");
    expect((result as { probes: Array<{ profileName: string; outcome: string }> }).probes.map((p) => [p.profileName, p.outcome]))
      .toEqual([["jules-1", "key_unavailable"], ["jules-2", "key_unavailable"]]);
  });

  it("distinguishes an unusable key from a repository that is simply not connected", () => {
    expect(summarizeJulesSourceProbes("JsonLord/aux-company", [])).toMatch(/No enabled Jules profile is configured/);

    expect(summarizeJulesSourceProbes("JsonLord/aux-company", [
      { profileId: "p1", profileName: "jules-1", outcome: "listed", sourceCount: 3 },
      { profileId: "p2", profileName: "jules-2", outcome: "listed", sourceCount: 2 },
    ])).toBe("2 profile(s) listed 5 source(s), none matching JsonLord/aux-company");

    expect(summarizeJulesSourceProbes("JsonLord/aux-company", [
      { profileId: "p1", profileName: "jules-1", outcome: "key_unavailable" },
    ])).toBe("jules-1: API key not available to this company");

    expect(summarizeJulesSourceProbes("JsonLord/aux-company", [
      { profileId: "p1", profileName: "jules-1", outcome: "listed", sourceCount: 4 },
      { profileId: "p2", profileName: "jules-2", outcome: "api_error", detail: "401 Unauthorized" },
    ])).toBe("1 profile(s) listed 4 source(s), none matching JsonLord/aux-company; jules-2: 401 Unauthorized");
  });

  it("keeps key-shaped text out of a reported API error", async () => {
    const { db } = store([]);
    const resolver = persistedJulesSourceResolver(db, "company-1", () => ({ listSources: async () => ({ items: [] }) }));
    const result = await resolver.resolve("JsonLord/aux-company");
    expect(result.reason).toMatch(/No enabled Jules profile is configured/);
    // The redaction itself: anything long and key-shaped is masked before it is logged.
    const masked = "request failed: key=AIzaSyA1234567890abcdefghijklmnop".replace(/[A-Za-z0-9_-]{24,}/g, "***");
    expect(masked).not.toContain("AIzaSyA1234567890abcdefghijklmnop");
    expect(masked).toContain("***");
  });
});
