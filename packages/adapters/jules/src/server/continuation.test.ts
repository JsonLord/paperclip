import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "./execute.js";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
const call = (mock: ReturnType<typeof vi.fn>, i: number) => ({
  url: String(mock.mock.calls[i][0]),
  method: mock.mock.calls[i][1]?.method as string | undefined,
  body: mock.mock.calls[i][1]?.body
    ? JSON.parse(String(mock.mock.calls[i][1].body))
    : null,
});

const run = async (
  state: string | null,
  fetchMock: ReturnType<typeof vi.fn>,
) => {
  vi.stubGlobal("fetch", fetchMock);
  return execute({
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Market Analyst",
      adapterType: "jules",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: state === null ? null : { julesSessionId: "remote-1" },
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {
      env: { JULES_API_KEY: "secret" },
      source: "sources/acme",
      repository: "acme/co",
      outcomeTemplate: "bootstrap",
      maxWaitSec: 0,
    },
    context: {
      wakeReason: "interval_elapsed",
      assignment: {
        title: "Map the competitor landscape",
        description: "Ten platforms.",
        priority: "high",
        goal: "Round 1",
      },
    },
    onLog: async () => {},
    onMeta: async () => {},
  });
};

describe("waking an agent that already has a Jules session", () => {
  it("continues the live session, which costs no session start", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ id: "remote-1", state: "IN_PROGRESS" })) // getSession
      .mockResolvedValueOnce(ok({})) // sendMessage
      .mockResolvedValueOnce(ok({ id: "remote-1", state: "IN_PROGRESS" })) // getSession
      .mockResolvedValueOnce(ok({ activities: [] }));
    await run("existing", fetchMock);
    const sent = call(fetchMock, 1);
    expect(sent.url).toContain(":sendMessage");
    expect(sent.method).toBe("POST");
    // The whole point: the worker is told why it was woken and what the outcome now says.
    expect(sent.body.message).toContain("Continuation");
    expect(sent.body.message).toContain("interval_elapsed");
    expect(sent.body.message).toContain("Map the competitor landscape");
    expect(sent.body.message).toContain("do not open a second session");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(":create");
  });

  it("leaves a COMPLETED session that delivered a pull request alone", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          id: "remote-1",
          state: "COMPLETED",
          outputs: [
            { pullRequest: { url: "https://github.com/acme/co/pull/3" } },
          ],
        }),
      )
      .mockResolvedValueOnce(ok({ activities: [] }));
    const result = await run("existing", fetchMock);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(":sendMessage");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(":create");
    expect(result.resultJson).toMatchObject({
      completionCandidate: true,
      accepted: false,
    });
  });

  for (const state of ["COMPLETED", "FAILED", "CANCELLED"]) {
    it(`does not allocate another session for a same-run ${state} retry`, async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(ok({ id: "remote-1", state }))
        .mockResolvedValueOnce(ok({ activities: [] }));
      const result = await run("existing", fetchMock);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.every(
          (_, i) => call(fetchMock, i).method !== "POST",
        ),
      ).toBe(true);
      expect(result.resultJson).toMatchObject({
        completionCandidate: false,
        accepted: false,
        julesSessionId: "remote-1",
      });
      expect(result.exitCode).toBe(1);
    });
  }

  it("still creates a session when there is none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ id: "remote-1", state: "QUEUED" }))
      .mockResolvedValueOnce(ok({ activities: [] }));
    await run(null, fetchMock);
    expect(call(fetchMock, 0).method).toBe("POST");
  });
});
