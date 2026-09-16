import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JulesRunCapabilityClaims } from "../services/jules-run-capability.js";
import { assertCapabilityBinding } from "../services/jules-callbacks.js";
import { issueJulesRunCapability, verifyJulesRunCapability } from "../services/jules-run-capability.js";
import { validateOutboxEvent } from "../services/jules-outbox.js";

const session = { id: "local-session", companyId: "company-a", profileId: "profile", companySourceId: "source", paperclipRunId: "run-1", julesSessionId: "remote-x", agentId: "agent-a", goalId: "goal-a", projectId: "project-a", issueId: "issue-a", outcomeId: "issue-a", status: "IN_PROGRESS", capabilityVersion: 1 } as never;
const claims = { companyId: "company-a", paperclipRunId: "run-1", julesSessionId: "remote-x", agentId: "agent-a", goalId: "goal-a", projectId: "project-a", issueId: "issue-a", outcomeId: "issue-a", allowedOperations: ["read_run_context", "report_progress"], version: 1 } as const;

beforeEach(() => { process.env.PAPERCLIP_JULES_CAPABILITY_SECRET = "a-secure-test-secret-that-is-longer-than-32-chars"; });
afterEach(() => { delete process.env.PAPERCLIP_JULES_CAPABILITY_SECRET; });

describe("Jules run capabilities", () => {
  it("allows only the issued operation and exact persisted binding", () => {
    const token = issueJulesRunCapability(claims, 300, Date.parse("2026-09-15T00:00:00Z"));
    const verified = verifyJulesRunCapability(token, "report_progress", Date.parse("2026-09-15T00:01:00Z"));
    expect(() => assertCapabilityBinding(verified, session, "report_progress", { sessionId: "remote-x" })).not.toThrow();
    expect(() => verifyJulesRunCapability(token, "submit_completion_candidate", Date.parse("2026-09-15T00:01:00Z"))).toThrow(/does not allow/);
  });

  it.each([
    ["company isolation", { companyId: "company-b" }],
    ["run isolation", { paperclipRunId: "run-2" }],
    ["session isolation", { julesSessionId: "remote-y" }],
    ["agent isolation", { agentId: "agent-b" }],
    ["organizational isolation", { issueId: "issue-b" }],
    ["rotation/revocation", { version: 2 }],
  ])("rejects %s", (_label, changed) => {
    expect(() => assertCapabilityBinding({ ...claims, issuedAt: 1, expiresAt: 9999999999, jti: "jti", ...changed } as JulesRunCapabilityClaims, session, "report_progress")).toThrow();
  });

  it("rejects expired credentials", () => {
    const token = issueJulesRunCapability(claims, 60, Date.parse("2026-09-15T00:00:00Z"));
    expect(() => verifyJulesRunCapability(token, "report_progress", Date.parse("2026-09-15T00:02:00Z"))).toThrow(/expired/);
  });

  it("rejects payload IDs that contradict the authenticated binding", () => {
    expect(() => assertCapabilityBinding({ ...claims, issuedAt: 1, expiresAt: 9999999999, jti: "jti" } as JulesRunCapabilityClaims, session, "report_progress", { sessionId: "remote-y" })).toThrow(/contradicts/);
  });
});

describe("FounderOS outbox binding", () => {
  const valid = { version: "founderos.outbox/v1", eventId: "run-1:blocker:v1", runId: "run-1", sessionId: "remote-x", type: "blocker", payload: { issueId: "issue-a", description: "Blocked" } };
  it("accepts only the bound run namespace", () => expect(validateOutboxEvent(valid, session)).toMatchObject({ eventId: valid.eventId }));
  it("rejects another run or company", () => {
    expect(() => validateOutboxEvent({ ...valid, runId: "run-2" }, session)).toThrow(/namespace/);
    expect(() => validateOutboxEvent({ ...valid, payload: { companyId: "company-b" } }, session)).toThrow(/companyId/);
  });
  it("rejects malformed and self-approval-shaped events", () => {
    expect(() => validateOutboxEvent({ ...valid, version: "unknown" }, session)).toThrow(/Malformed/);
  });
});
