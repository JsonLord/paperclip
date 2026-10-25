import { describe, expect, it, vi } from "vitest";
import { activityLog } from "@paperclipai/db";
import { createJulesOutboxReconciler, parsePullRequestUrl } from "../services/jules-outbox.js";
import { callbackDb } from "./jules-callbacks.test.js";

const event = {
  version: "founderos.outbox/v1", eventId: "evt-1", runId: "run-a", sessionId: "remote-a",
  type: "progress", payload: { summary: "Drafted the competitor landscape and cited every price." },
};
const listing = [{ name: "evt-1.json", type: "file", download_url: "https://raw.example/event" }];
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const refOf = (call: unknown[]) => new URL(String(call[0])).searchParams.get("ref");

describe("where the Jules outbox is read from", () => {
  it("parses the pull request URL Jules returns, and nothing else", () => {
    expect(parsePullRequestUrl("https://github.com/acme/company/pull/12")).toEqual({ repo: "acme/company", number: 12 });
    expect(parsePullRequestUrl("https://github.com/acme/company/pull/12/files")).toEqual({ repo: "acme/company", number: 12 });
    for (const bad of [null, "", "https://github.com/acme/company/issues/12", "https://evil.test/acme/company/pull/12"]) {
      expect(parsePullRequestUrl(bad)).toBeNull();
    }
  });

  it("reads the pull request branch, because a session is told not to merge", async () => {
    const store = callbackDb();
    store.session.pullRequestUrl = "https://github.com/acme/company/pull/12";
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ head: { ref: "jules/landscape" } }))
      .mockResolvedValueOnce(ok(listing))
      .mockResolvedValueOnce(ok(event));
    const outbox = createJulesOutboxReconciler(store.db, { fetchImpl });
    expect(await outbox.reconcileSession(store.session as never)).toEqual({ discovered: 1, applied: 1 });
    expect(refOf(fetchImpl.mock.calls[1])).toBe("jules/landscape");
    expect(store.rows.get(activityLog)).toHaveLength(1);
  });

  it("falls back to the starting branch when the branch holds no outbox", async () => {
    const store = callbackDb();
    store.session.pullRequestUrl = "https://github.com/acme/company/pull/12";
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ head: { ref: "jules/landscape" } }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(ok(listing))
      .mockResolvedValueOnce(ok(event));
    const outbox = createJulesOutboxReconciler(store.db, { fetchImpl });
    expect(await outbox.reconcileSession(store.session as never)).toEqual({ discovered: 1, applied: 1 });
    expect(refOf(fetchImpl.mock.calls[2])).toBe("main");
  });

  it("does not drop the starting branch when the pull request lookup fails", async () => {
    const store = callbackDb();
    store.session.pullRequestUrl = "https://github.com/acme/company/pull/12";
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("GitHub is having a moment"))
      .mockResolvedValueOnce(ok(listing))
      .mockResolvedValueOnce(ok(event));
    const outbox = createJulesOutboxReconciler(store.db, { fetchImpl });
    expect(await outbox.reconcileSession(store.session as never)).toEqual({ discovered: 1, applied: 1 });
    expect(refOf(fetchImpl.mock.calls[1])).toBe("main");
  });

  it("reads only the starting branch before a pull request exists", async () => {
    const store = callbackDb();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok(listing))
      .mockResolvedValueOnce(ok(event));
    const outbox = createJulesOutboxReconciler(store.db, { fetchImpl });
    expect(await outbox.reconcileSession(store.session as never)).toEqual({ discovered: 1, applied: 1 });
    expect(refOf(fetchImpl.mock.calls[0])).toBe("main");
  });
});
