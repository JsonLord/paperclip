import { describe, expect, it } from "vitest";
import {
  activityLog,
  companyJulesSources,
  heartbeatRuns,
  issues,
  issueWorkProducts,
  julesSessions,
} from "@paperclipai/db";
import { fakeDb } from "./fixtures/fake-db.js";
import { registerJulesCompletion } from "../services/jules-completion.js";
const session = {
  id: "s",
  companyId: "c",
  agentId: "a",
  issueId: "i",
  paperclipRunId: "r",
  companySourceId: "source",
  julesSessionId: "remote",
  status: "COMPLETED_UNVALIDATED",
  resultJson: {},
  pullRequestUrl: "https://github.com/owner/repo/pull/14",
};
function fixture() {
  return fakeDb([
    [julesSessions, [{ ...session }]],
    [
      issues,
      [{ id: "i", companyId: "c", status: "todo", executionRunId: "r" }],
    ],
    [
      heartbeatRuns,
      [{ id: "r", companyId: "c", agentId: "a", status: "succeeded" }],
    ],
    [
      companyJulesSources,
      [
        {
          id: "source",
          companyId: "c",
          repository: "owner/repo",
          startingBranch: "main",
        },
      ],
    ],
  ]);
}
describe("canonical asynchronous Jules completion registration", () => {
  it("registers a late PR after heartbeat ends, enters review, survives retry/restart without acceptance or duplicates", async () => {
    const f = fixture();
    const first = await registerJulesCompletion(f.db, "s");
    expect(first).toMatchObject({
      createdByRunId: "r",
      status: "ready_for_review",
      reviewState: "needs_board_review",
      metadata: {
        accepted: false,
        remoteSessionId: "remote",
        validation: { verdict: "REVIEW_REQUIRED" },
      },
    });
    expect(f.rows.get(issues)?.[0].status).toBe("in_review");
    await registerJulesCompletion(f.db, "s");
    expect(f.rows.get(issueWorkProducts)).toHaveLength(1);
    expect(f.rows.get(activityLog)).toHaveLength(1);
  });
  it("does not register work while the remote session remains active", async () => {
    const f = fixture();
    f.rows.get(julesSessions)![0].status = "IN_PROGRESS";
    expect(await registerJulesCompletion(f.db, "s")).toBeNull();
    expect(f.rows.get(issueWorkProducts) ?? []).toHaveLength(0);
  });
  it.each([
    "https://github.com/other/repo/pull/14",
    "https://evil.test/owner/repo/pull/14",
  ])("rejects a foreign PR %s", async (url) => {
    const f = fixture();
    f.rows.get(julesSessions)![0].pullRequestUrl = url;
    await expect(registerJulesCompletion(f.db, "s")).rejects.toThrow("outside");
  });
  it("enforces company isolation and does not transition a newer issue execution", async () => {
    const f = fixture();
    f.rows.get(issues)![0].companyId = "foreign";
    await expect(registerJulesCompletion(f.db, "s")).rejects.toThrow("binding");
    const g = fixture();
    g.rows.get(issues)![0].executionRunId = "newer";
    await registerJulesCompletion(g.db, "s");
    expect(g.rows.get(issues)![0].status).toBe("todo");
  });
});
