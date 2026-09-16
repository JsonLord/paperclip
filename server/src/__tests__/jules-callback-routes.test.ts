import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityLog, approvals, issueWorkProducts, julesSessions } from "@paperclipai/db";
import { julesRoutes } from "../routes/jules.js";
import { issueJulesRunCapability } from "../services/jules-run-capability.js";
import { callbackDb } from "./jules-callbacks.test.js";

const binding = { companyId: "company-a", paperclipRunId: "run-a", julesSessionId: "remote-a", agentId: "agent-a", goalId: "goal-a", projectId: "project-a", issueId: "issue-a", outcomeId: "issue-a", version: 1 };

beforeEach(() => { process.env.PAPERCLIP_JULES_CAPABILITY_SECRET = "a-secure-route-test-secret-longer-than-32-characters"; });
afterEach(() => { delete process.env.PAPERCLIP_JULES_CAPABILITY_SECRET; });

function appFor(db: ReturnType<typeof callbackDb>["db"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.actor = { type: "none", source: "none" }; next(); });
  app.use("/api", julesRoutes(db));
  return app;
}

describe("scoped Jules callback routes", () => {
  it("allows scoped context/progress and denies an ungranted completion operation", async () => {
    const store = callbackDb();
    const app = appFor(store.db);
    const token = issueJulesRunCapability({ ...binding, allowedOperations: ["read_run_context", "report_progress"] });
    const context = await request(app).get("/api/jules/v1/runs/run-a/context").set("authorization", `Bearer ${token}`);
    expect(context.status).toBe(200);
    expect(context.body.authoritativeBinding).toEqual({ companyId: "company-a", runId: "run-a", sessionId: "remote-a", agentId: "agent-a", goalId: "goal-a", projectId: "project-a", issueId: "issue-a" });
    const progress = await request(app).post("/api/jules/v1/runs/run-a/progress").set("authorization", `Bearer ${token}`).send({ eventId: "route-progress", summary: "Completed the experiment assets and verified browser checks." });
    expect(progress.status).toBe(202);
    expect(store.rows.get(activityLog)).toHaveLength(1);
    const complete = await request(app).post("/api/jules/v1/runs/run-a/complete").set("authorization", `Bearer ${token}`).send({ eventId: "not-allowed" });
    expect(complete.status).toBe(403);
    expect(store.rows.get(julesSessions)?.[0].status).toBe("IN_PROGRESS");
  });

  it("rejects cross-company and contradictory-session credentials", async () => {
    const store = callbackDb();
    const app = appFor(store.db);
    const companyB = issueJulesRunCapability({ ...binding, companyId: "company-b", allowedOperations: ["report_progress"] });
    expect((await request(app).post("/api/jules/v1/runs/run-a/progress").set("authorization", `Bearer ${companyB}`).send({ eventId: "cross", summary: "A meaningful cross-company progress message." })).status).toBe(403);
    const valid = issueJulesRunCapability({ ...binding, allowedOperations: ["report_progress"] });
    expect((await request(app).post("/api/jules/v1/runs/run-a/progress").set("authorization", `Bearer ${valid}`).send({ eventId: "wrong-session", sessionId: "remote-b", summary: "A meaningful but contradictory session message." })).status).toBe(403);
    expect(store.rows.get(activityLog)).toHaveLength(0);
  });

  it("promotes artifacts, approvals, and completion through the real route without duplication or self-acceptance", async () => {
    const store = callbackDb();
    const app = appFor(store.db);
    const token = issueJulesRunCapability({ ...binding, allowedOperations: ["report_artifact", "request_approval", "submit_completion_candidate"] });
    const artifact = { eventId: "route-artifact", path: "business-case/REPORT.md", title: "Report" };
    await request(app).post("/api/jules/v1/runs/run-a/artifacts").set("authorization", `Bearer ${token}`).send(artifact).expect(202);
    await request(app).post("/api/jules/v1/runs/run-a/artifacts").set("authorization", `Bearer ${token}`).send(artifact).expect(200);
    await request(app).post("/api/jules/v1/runs/run-a/approvals").set("authorization", `Bearer ${token}`).send({ eventId: "route-approval", actionType: "deployment" }).expect(202);
    await request(app).post("/api/jules/v1/runs/run-a/approvals").set("authorization", `Bearer ${token}`).send({ eventId: "self-approve", actionType: "deployment", status: "approved" }).expect(403);
    await request(app).post("/api/jules/v1/runs/run-a/complete").set("authorization", `Bearer ${token}`).send({ eventId: "route-complete", pullRequestUrl: "https://github.com/acme/company/pull/1" }).expect(202);
    expect(store.rows.get(issueWorkProducts)).toHaveLength(1);
    expect(store.rows.get(approvals)).toHaveLength(1);
    expect(store.rows.get(julesSessions)?.[0]).toMatchObject({ status: "COMPLETED_UNVALIDATED", completionCandidate: true });
  });
});
