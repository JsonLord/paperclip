import { describe, expect, it } from "vitest";
import { selectJulesProfile, type JulesBrokerProfile } from "../services/jules-capacity.js";
import { parseGitHubPullRequestUrl } from "../services/heartbeat.js";
const profile = (patch: Partial<JulesBrokerProfile> = {}): JulesBrokerProfile => ({ id: "p1", enabled: true, status: "active", capabilities: ["context7", "linear"], sessionStartLimit: 15, reserveSessionStarts: 1, startsInWindow: 0, concurrentSessionLimit: 3, activeSessions: 0, sourceAccessible: true, ...patch });
describe("Jules capacity broker", () => {
  it("enforces capabilities and source access", () => {
    expect(selectJulesProfile([profile()], { requiredCapabilities: ["stitch"] }).kind).toBe("blocked_missing_capability");
    expect(selectJulesProfile([profile({ sourceAccessible: false })], { requiredCapabilities: ["linear"] }).kind).toBe("blocked_no_source_access");
  });
  it("uses rolling starts, concurrency, and reserve independently", () => {
    expect(selectJulesProfile([profile({ activeSessions: 3 })], { requiredCapabilities: [] }).kind).toBe("queue");
    expect(selectJulesProfile([profile({ startsInWindow: 14 })], { requiredCapabilities: [] }).kind).toBe("blocked_quota");
    expect(selectJulesProfile([profile({ startsInWindow: 14 })], { requiredCapabilities: [], urgent: true })).toEqual({ kind: "dispatch", profileId: "p1" });
  });
  it("selects the least-consumed eligible profile", () => expect(selectJulesProfile([profile({ id: "busy", startsInWindow: 8 }), profile({ id: "free", startsInWindow: 2 })], { requiredCapabilities: ["linear"] })).toEqual({ kind: "dispatch", profileId: "free" }));
  it("blocks overlapping write scopes", () => expect(selectJulesProfile([profile()], { requiredCapabilities: [], writeConflict: true }).kind).toBe("blocked_conflict"));
  it("accepts only canonical GitHub pull request URLs for registration", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/acme/company/pull/42")).toEqual({ url: "https://github.com/acme/company/pull/42", externalId: "acme/company#42" });
    expect(parseGitHubPullRequestUrl("https://evil.example/acme/company/pull/42")).toBeNull();
  });
});
