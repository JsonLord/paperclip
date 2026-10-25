import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdapterInvocationMeta } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
afterEach(() => vi.unstubAllGlobals());
describe("Jules REST adapter", () => {
  it("creates a remote session without using a local cwd and never self-accepts completion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "remote-1", state: "COMPLETED", outputs: [{ pullRequest: { url: "https://github.com/acme/co/pull/1" } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ activities: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const metadata: unknown[] = [];
    const result = await execute({ runId: "run-1", agent: { id: "agent-1", companyId: "company-1", name: "Builder", adapterType: "jules", adapterConfig: {} }, runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null }, config: { env: { JULES_API_KEY: "secret" }, source: "sources/acme", repository: "acme/co", profileId: "00000000-0000-4000-8000-000000000001", companySourceId: "00000000-0000-4000-8000-000000000002", maxWaitSec: 0 }, context: {}, onLog: async () => {}, onMeta: async (meta: AdapterInvocationMeta) => { metadata.push(meta); } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("cwd");
    expect(result.resultJson).toMatchObject({ completionCandidate: true, accepted: false });
    expect(metadata).toHaveLength(2);
  });
  it("resumes the same remote session instead of creating a duplicate", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "remote-1", state: "IN_PROGRESS", url: "https://jules.google.com/session/remote-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "remote-1", state: "IN_PROGRESS" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ activities: [{ id: "activity-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await execute({ runId: "run-1", agent: { id: "a", companyId: "c", name: "A", adapterType: "jules", adapterConfig: {} }, runtime: { sessionId: null, sessionParams: { julesSessionId: "remote-1" }, sessionDisplayId: null, taskKey: null }, config: { env: { JULES_API_KEY: "secret" }, source: "source", repository: "acme/co", maxWaitSec: 0 }, context: {}, onLog: async () => {} });
    // The session is read first, then continued in place — never re-created.
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
    expect(String(fetchMock.mock.calls[1][0])).toContain(":sendMessage");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(":create");
  });
  it("does not spend a Jules start when required goal support is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await execute({ runId: "run-2", agent: { id: "a", companyId: "c", name: "A", adapterType: "jules", adapterConfig: {} }, runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null }, config: { env: { JULES_API_KEY: "secret" }, source: "source", repository: "acme/co", outcomeTemplate: "bootstrap" }, context: { goalSupport: { missingRequiredPacks: ["pitch.bpw-10-step@1.0.0"] } }, onLog: async () => {} });
    expect(result.errorCode).toBe("jules_required_support_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
