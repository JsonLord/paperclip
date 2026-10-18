import { nodepadCandidates } from "./fixtures/nodepad-candidates.js";
import { workforceControlService } from "../services/workforce/control.js";
import { workforceRoutes } from "../routes/workforce.js";
import { tickWorkforceReporters } from "../services/workforce/scheduler.js";
import { workforceMetrics } from "../services/workforce/metrics.js";
import { authorizeWorkforceNodepad } from "../services/workforce/guards.js";
import { workforceImportService } from "../services/workforce/importer.js";
import { workforceService } from "../services/workforce/service.js";
import { canonicalWorkforce } from "../services/workforce/definitions.js";
import { workforceMembers } from "@paperclipai/db";
import { goalRoutes } from "../routes/goals.js";
import { julesSessionService } from "../services/jules-sessions.js";
import { documentService } from "../services/documents.js";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq, and } from "drizzle-orm";
import {
  createDb,
  applyPendingMigrations,
  ensurePostgresDatabase,
  companies,
  agents,
  goals,
  issues,
  nodepadBindings,
  validationProgrammes,
  validationRecords,
  companyRepositoryBindings,
  heartbeatRuns,
  githubActionRuns,
  issueWorkProducts,
  julesProfiles,
  companyJulesSources,
  julesProfileSources,
  julesCapacityEvents,
  julesPools,
  julesRepositoryLeases,
  type Db,
} from "@paperclipai/db";
import {
  validationPolicySchema,
  validationTaskSchema,
} from "@paperclipai/shared";
import { validationProgrammeService } from "../services/validation/programmes.js";
import {
  nodepadService,
  nodepadHttpProvider,
  type NodepadProvider,
  type NodepadCandidateInput,
  type NodepadBinding,
} from "../services/validation/nodepad.js";
import {
  githubActionsService,
  type ActionsProvider,
  type ActionRemoteRun,
} from "../services/validation/github-actions.js";
import { assembleCeoContext } from "../services/validation/ceo-context.js";
import { inspectValidationDispatch } from "../services/validation/task-policy.js";
import { issueService } from "../services/issues.js";
import { julesCapacityBroker } from "../services/jules-capacity-broker.js";
import { validationRoutes } from "../routes/validation.js";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/error-handler.js";
import {
  snapshot,
  interview,
  adaptation,
  decision,
} from "./fixtures/validation.js";
const { wakeup } = vi.hoisted(() => ({
  wakeup: vi.fn(async () => ({ id: "fixture-wakeup" })),
}));
vi.mock("../services/heartbeat.js", () => ({
  heartbeatService: () => ({ wakeup }),
}));
let db: Db, instance: { stop(): Promise<void> }, directory: string;
async function company() {
  const [c] = await db
    .insert(companies)
    .values({
      name: "Validation fixture",
      issuePrefix: `V${randomUUID().slice(0, 7)}`,
    })
    .returning();
  const [ceo] = await db
    .insert(agents)
    .values({
      companyId: c.id,
      name: "CEO",
      role: "ceo",
      adapterType: "hermes_local",
      status: "idle",
    })
    .returning();
  const [vision] = await db
    .insert(goals)
    .values({
      companyId: c.id,
      title: "Reduce venture uncertainty",
      level: "company",
      status: "active",
      ownerAgentId: ceo.id,
    })
    .returning();
  return { c, ceo, vision };
}
async function programme() {
  const fixture = await company();
  const p = await validationProgrammeService(db).start(
    fixture.c.id,
    {
      ceoAgentId: fixture.ceo.id,
      visionGoalId: fixture.vision.id,
      founderConstraints: ["No public deployment"],
    },
    "founder",
  );
  return { ...fixture, p };
}
function appFor(companyId: string, agentId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = agentId
      ? { type: "agent", companyId, agentId, source: "agent_key" }
      : {
          type: "board",
          userId: "founder",
          companyIds: [companyId],
          source: "session",
        };
    next();
  });
  app.use("/api", validationRoutes(db));
  app.use("/api", workforceRoutes(db));
  app.use("/api", goalRoutes(db));
  app.use("/api", issueRoutes(db, {} as never));
  app.use(errorHandler);
  return app;
}
const fixtureCandidate = async (
  binding: NodepadBinding,
  _key: string,
  input: NodepadCandidateInput,
) => ({
  candidateId: `candidate:${input.candidate.idempotencyKey}`,
  companyId: binding.companyId,
  workspaceId: binding.workspaceId,
});
const fixtureProvider = (
  state: ReturnType<typeof snapshot>,
): NodepadProvider => ({
  mode: "fixture",
  read: async () => state,
  submitEvidence: fixtureCandidate,
  proposeResearchGap: fixtureCandidate,
  proposeHypothesis: fixtureCandidate,
  proposeCounterHypothesis: fixtureCandidate,
  proposeExperiment: fixtureCandidate,
  submitExperimentResult: fixtureCandidate,
});
async function bind(
  f: Awaited<ReturnType<typeof programme>>,
  state = snapshot(f.c.id),
) {
  const service = nodepadService(
    db,
    fixtureProvider(state),
    async () => "fixture-credential",
  );
  await service.bind(f.c.id, {
    baseUrl: "https://nodepad.example",
    workspaceId: state.workspaceId + f.c.id,
    apiKeySecretRef: randomUUID(),
  });
  state.workspaceId += f.c.id;
  await service.sync(f.c.id);
  return { service, state };
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "paperclip-validation-"));
  const port = await new Promise<number>((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address() as net.AddressInfo;
      socket.close(() => resolve(address.port));
    });
  });
  const EmbeddedPostgres = (await import("embedded-postgres")).default;
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    user: "paperclip",
    password: "fixture",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
  instance = pg;
  await pg.initialise();
  await pg.start();
  const connectionString = `postgres://paperclip:fixture@127.0.0.1:${port}/paperclip`;
  await ensurePostgresDatabase(
    `postgres://paperclip:fixture@127.0.0.1:${port}/postgres`,
    "paperclip",
  );
  await applyPendingMigrations(connectionString);
  db = createDb(connectionString);
}, 60_000);
afterAll(async () => {
  if (db) await db.$client.end();
  if (instance) await instance.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("durable company-scoped validation management", () => {
  it("applies migrations repeatably and preserves legacy company mode", async () => {
    const f = await company();
    expect(f.c.mode).toBe("legacy");
    const pool = await db.select().from(julesPools);
    expect(pool[0]).toMatchObject({
      dailyStarts: 90,
      concurrency: 3,
      windowSec: 86400,
    });
  });
  it("starts idempotently with one CEO, one direction issue and explicit pause/resume", async () => {
    const f = await programme(),
      svc = validationProgrammeService(db);
    const again = await svc.start(
      f.c.id,
      { ceoAgentId: f.ceo.id, visionGoalId: f.vision.id },
      "founder",
    );
    expect(again.id).toBe(f.p.id);
    expect(
      await db.select().from(agents).where(eq(agents.companyId, f.c.id)),
    ).toHaveLength(46);
    expect(
      await db.select().from(issues).where(eq(issues.companyId, f.c.id)),
    ).toHaveLength(1);
    await svc.pause(f.c.id, "Founder unavailable", "founder");
    await svc.pause(f.c.id, "Founder unavailable", "founder");
    const paused = await svc.get(f.c.id);
    expect(paused?.pauses).toHaveLength(1);
    await svc.pause(f.c.id, null, "founder");
    expect((await svc.get(f.c.id))?.pauses[0].end).not.toBeNull();
  });
  it("starts when the company was already created in idea_validation mode", async () => {
    const f = await company();
    await db
      .update(companies)
      .set({ mode: "idea_validation" })
      .where(eq(companies.id, f.c.id));
    const p = await validationProgrammeService(db).start(
      f.c.id,
      { ceoAgentId: f.ceo.id, visionGoalId: f.vision.id },
      "founder",
    );
    const ceo = await db.select().from(agents).where(eq(agents.id, f.ceo.id));
    expect(p.ceoAgentId).toBe(f.ceo.id);
    expect(ceo[0].runtimeConfig.heartbeat).toMatchObject({
      enabled: true,
      intervalSec: 86400,
    });
  });
  it("keeps root Vision edits founder-owned through existing goal routes", async () => {
    const f = await programme();
    expect(
      (
        await request(appFor(f.c.id, f.ceo.id))
          .patch(`/api/goals/${f.vision.id}`)
          .send({ title: "Pivot without approval" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(appFor(f.c.id))
          .patch(`/api/goals/${f.vision.id}`)
          .send({ title: "Founder-approved vision" })
      ).status,
    ).toBe(200);
  });
  it("enforces cross-company agent and root goal membership", async () => {
    const a = await company(),
      b = await company();
    await expect(
      validationProgrammeService(db).start(
        a.c.id,
        { ceoAgentId: b.ceo.id, visionGoalId: a.vision.id },
        "founder",
      ),
    ).rejects.toThrow(/company CEO/);
  });
  it("requires founder approval for early exit and cumulative timing expansion", async () => {
    const f = await programme(),
      svc = validationProgrammeService(db);
    const first = await svc.propose(f.c.id, adaptation, "extend-1", f.ceo.id);
    await svc.applyProposal(f.c.id, first.id, f.ceo.id, false);
    const second = await svc.propose(f.c.id, adaptation, "extend-2", f.ceo.id);
    expect(second.status).toBe("founder_pending");
    await expect(
      svc.applyProposal(f.c.id, second.id, f.ceo.id, false),
    ).rejects.toThrow(/Founder approval/);
    const exit = await svc.propose(
      f.c.id,
      { ...adaptation, action: "EXIT_PHASE_EARLY" },
      "exit",
      f.ceo.id,
    );
    await expect(
      svc.applyProposal(f.c.id, exit.id, f.ceo.id, false),
    ).rejects.toThrow(/Founder approval/);
    await svc.applyProposal(f.c.id, exit.id, "founder", true);
    expect((await svc.get(f.c.id))?.phase).toBe("CONCENTRATE");
  });
  it("revisions founder strategy without turning it into evidence or allowing constraint mutation", async () => {
    const f = await programme(),
      svc = validationProgrammeService(db);
    const statement = {
      visionAnchor: f.vision.id,
      interpretation: "Validate first",
      constraints: ["No public deployment"],
    };
    const one = await svc.statement(f.c.id, statement, { userId: "founder" });
    const two = await svc.statement(
      f.c.id,
      { ...statement, interpretation: "Prioritize interviews" },
      { userId: "founder" },
    );
    expect(two.document.latestRevisionNumber).toBe(
      one.document.latestRevisionNumber + 1,
    );
    await expect(
      svc.statement(
        f.c.id,
        { ...statement, constraints: [] },
        { agentId: f.ceo.id },
      ),
    ).rejects.toThrow(/Founder constraints/);
    expect(
      await db
        .select()
        .from(nodepadBindings)
        .where(eq(nodepadBindings.companyId, f.c.id)),
    ).toHaveLength(0);
  });
  it("protects strategy through generic document and issue endpoints too", async () => {
    const f = await programme();
    await expect(
      documentService(db).upsertIssueDocument({
        issueId: f.p.directionIssueId,
        key: "founder-statement",
        format: "markdown",
        body: JSON.stringify({
          visionAnchor: f.vision.id,
          interpretation: "Bypass",
          constraints: [],
        }),
        createdByAgentId: f.ceo.id,
      }),
    ).rejects.toThrow(/Founder constraints/);
    await expect(
      issueService(db).update(f.p.directionIssueId, { status: "done" }),
    ).rejects.toThrow(/persistent strategy/);
  });
  it("bounds CEO context and retains logical identity across repeated assembly", async () => {
    const f = await programme();
    await bind(f);
    const a = await assembleCeoContext(db, f.c.id),
      b = await assembleCeoContext(db, f.c.id);
    expect(a?.logicalManagerId).toBe(f.ceo.id);
    expect(b?.logicalManagerId).toBe(a?.logicalManagerId);
    expect(JSON.stringify(a).length).toBeLessThanOrEqual(48_000);
    expect(a).not.toHaveProperty("providerThread");
  });
  it("enforces API company isolation, journal review, max-three cycles and founder authority", async () => {
    const f = await programme(),
      app = appFor(f.c.id, f.ceo.id),
      other = await programme();
    expect(
      (await request(app).get(`/api/companies/${other.c.id}/validation`))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/companies/${f.c.id}/validation/cycles`)
          .set("idempotency-key", "bad")
          .send({ mustWinOutcomes: ["a", "b", "c", "d"] })
      ).status,
    ).toBe(400);
    const journal = {
      decision: "Prioritize interviews",
      category: "sequence",
      requester: f.ceo.id,
      rationale: "Direct evidence blocks progress",
      authority: "ceo",
      impact: "low",
      reversible: true,
      alternatives: ["More desk research"],
      expectedOutcome: "Three interviews",
      expectedSignal: "Analyzed transcripts",
      reviewDate: "2026-10-20T00:00:00Z",
    };
    const created = await request(app)
      .post(`/api/companies/${f.c.id}/validation/decisions`)
      .set("idempotency-key", "decision")
      .send(journal);
    expect(created.status).toBe(201);
    const review = await request(app)
      .patch(
        `/api/companies/${f.c.id}/validation/decisions/${created.body.id}/review`,
      )
      .send({
        actualResult: "Interviews completed",
        disposition: "keep",
        signalOccurred: true,
      });
    expect(review.status).toBe(200);
    expect(review.body.payload.review.signalOccurred).toBe(true);
    const restricted = await request(app)
      .post(`/api/companies/${f.c.id}/validation/decisions`)
      .set("idempotency-key", "pivot")
      .send({ ...journal, category: "pivot" });
    expect(restricted.status).toBe(403);
  });
  it("queues strategic requests, resolves founder replies and wakes the existing CEO", async () => {
    const f = await programme(),
      app = appFor(f.c.id, f.ceo.id);
    const sent = await request(app)
      .post(`/api/companies/${f.c.id}/validation/decision-requests`)
      .set("idempotency-key", "vision")
      .send({
        ...decision,
        category: "vision",
        deadline: "2099-01-01T00:00:00Z",
      });
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe("briefing_pending");
    expect(
      (
        await request(app)
          .post(
            `/api/companies/${f.c.id}/validation/decision-requests/${sent.body.id}/resolve`,
          )
          .send({ answer: "Keep the vision" })
      ).status,
    ).toBe(403);
    const answered = await request(appFor(f.c.id))
      .post(
        `/api/companies/${f.c.id}/validation/decision-requests/${sent.body.id}/resolve`,
      )
      .send({ answer: "Keep the vision" });
    expect(answered.status).toBe(200);
    expect(wakeup).toHaveBeenCalledWith(
      f.ceo.id,
      expect.objectContaining({ reason: "validation_founder_reply" }),
    );
    const comment = await request(appFor(f.c.id))
      .post(`/api/issues/${f.p.directionIssueId}/comments`)
      .send({ body: "Please prioritize customer language" });
    expect(comment.status).toBe(201);
    expect(wakeup).toHaveBeenCalledWith(
      f.ceo.id,
      expect.objectContaining({ reason: "issue_commented" }),
    );
  });
});

describe("Nodepad isolation and candidate submission", () => {
  it("reports missing configuration and fixture success honestly", async () => {
    const f = await programme();
    expect(await nodepadService(db).sync(f.c.id)).toMatchObject({
      status: "READY_CONFIG",
    });
    const { service } = await bind(f);
    expect((await service.sync(f.c.id)).status).toBe("PASS_LOCAL");
  });
  it("rejects shared workspace binding, mixed responses and mismatched secret access", async () => {
    const f = await programme(),
      other = await programme(),
      { state } = await bind(f);
    const denied = nodepadService(db, fixtureProvider(state), async () => {
      throw new Error("Company secret access denied");
    });
    await expect(
      denied.bind(other.c.id, {
        baseUrl: "https://nodepad.example",
        workspaceId: state.workspaceId,
        apiKeySecretRef: randomUUID(),
      }),
    ).rejects.toThrow(/access denied/);
    const wrong = nodepadService(
      db,
      fixtureProvider({ ...state, companyId: other.c.id }),
      async () => "fixture",
    );
    await expect(wrong.sync(f.c.id)).rejects.toThrow(/boundary/);
    await expect(
      nodepadService(db, fixtureProvider(state), async () => "fixture").bind(
        other.c.id,
        {
          baseUrl: "https://nodepad.example",
          workspaceId: state.workspaceId,
          apiKeySecretRef: randomUUID(),
        },
      ),
    ).rejects.toThrow();
  });

  it("proves A/B isolation across completely different company bindings", async () => {
    const compA = await programme();
    const compB = await programme();

    // Bind A to workspace-A
    const svc = nodepadService(
      db,
      fixtureProvider({
        companyId: compA.c.id,
        workspaceId: "workspace-A",
        revision: "1",
        capturedAt: new Date().toISOString(),
        hypotheses: [],
        interviews: [],
        evidence: [],
        contradictions: [],
        researchGaps: [],
        experiments: [],
        materialChanges: [],
        clocks: {
          lastInterviewAt: null,
          lastCustomerInteractionAt: null,
          lastDirectEvidenceAt: null,
          lastMaterialMovementAt: null,
          lastExperimentAt: null,
        },
      }),
      async () => "fixture-a",
    );
    await svc.bind(compA.c.id, {
      baseUrl: "https://nodepad.example",
      workspaceId: "workspace-A",
      apiKeySecretRef: randomUUID(),
    });

    // Bind B to workspace-B
    const svcB = nodepadService(
      db,
      fixtureProvider({
        companyId: compB.c.id,
        workspaceId: "workspace-B",
        revision: "1",
        capturedAt: new Date().toISOString(),
        hypotheses: [],
        interviews: [],
        evidence: [],
        contradictions: [],
        researchGaps: [],
        experiments: [],
        materialChanges: [],
        clocks: {
          lastInterviewAt: null,
          lastCustomerInteractionAt: null,
          lastDirectEvidenceAt: null,
          lastMaterialMovementAt: null,
          lastExperimentAt: null,
        },
      }),
      async () => "fixture-b",
    );
    await svcB.bind(compB.c.id, {
      baseUrl: "https://nodepad.example",
      workspaceId: "workspace-B",
      apiKeySecretRef: randomUUID(),
    });

    const syncA = await svc.sync(compA.c.id);
    expect(syncA.snapshot.workspaceId).toBe("workspace-A");

    const syncB = await svcB.sync(compB.c.id);
    expect(syncB.snapshot.workspaceId).toBe("workspace-B");

    await expect(svcB.sync(compA.c.id)).rejects.toThrow(/boundary/);
  });

  it("provides Paperclip-side write idempotency for submitted candidates", async () => {
    const f = await programme();
    const { service, state } = await bind(f);
    const candidatePayload = {
      type: "evidence_submission" as const,
      idempotencyKey: "test-idemp-123",
      hypothesisId: state.hypotheses[0].id,
      sourceRef: "test-ref",
      contentHash: "a".repeat(64),
      pipelineRunRef: "run-ref",
      summary: "test summary",
    };

    const firstSubmit = await service.submit(
      f.c.id,
      f.p.ceoAgentId,
      candidatePayload,
    );
    expect(firstSubmit.status).toBe("submitted");

    const secondSubmit = await service.submit(
      f.c.id,
      f.p.ceoAgentId,
      candidatePayload,
    );
    expect(secondSubmit.id).toBe(firstSubmit.id);
    expect(secondSubmit.status).toBe("submitted");

    await expect(
      service.submit(f.c.id, f.p.ceoAgentId, {
        ...candidatePayload,
        summary: "Different content but same key",
      }),
    ).rejects.toThrow(/Idempotency key reused/);
  });
  it("submits idempotent candidates with provenance and forbids qualification fields", async () => {
    const f = await programme(),
      { service, state } = await bind(f);
    const candidate = {
      type: "evidence_submission" as const,
      idempotencyKey: "evidence-1",
      hypothesisId: "H-021",
      sourceRef: "github:acme/repo/interview.md",
      contentHash: "a".repeat(64),
      pipelineRunRef: "actions:1",
      summary: "Observed evidence",
    };
    const first = await service.submit(f.c.id, f.ceo.id, candidate),
      second = await service.submit(f.c.id, f.ceo.id, candidate);
    expect(second).toEqual(first);
    await expect(
      service.submit(f.c.id, f.ceo.id, {
        ...candidate,
        qualification: "validated",
      }),
    ).rejects.toThrow();
    await expect(
      service.submit(f.c.id, f.ceo.id, { ...candidate, summary: "Changed" }),
    ).rejects.toThrow(/Idempotency/);
    expect(
      (
        await db
          .select()
          .from(nodepadBindings)
          .where(eq(nodepadBindings.companyId, f.c.id))
      )[0].snapshot?.hypotheses[0].qualification,
    ).toBe("unqualified");
  });
});

async function actionFixture(f: Awaited<ReturnType<typeof programme>>) {
  await db.insert(companyRepositoryBindings).values({
    companyId: f.c.id,
    repository: "acme/validation",
    defaultBranch: "main",
    importRef: "main",
    importCommit: "fixture",
  });
  const [run] = await db
    .insert(heartbeatRuns)
    .values({
      companyId: f.c.id,
      agentId: f.ceo.id,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "running",
    })
    .returning();
  let remote: ActionRemoteRun | null = null;
  const dispatch = vi.fn(async (_repo, _workflow, _ref, inputs) => {
    remote = {
      id: 123,
      display_title: `paperclip:${inputs.paperclip_run_id}`,
      status: "in_progress",
      conclusion: null,
      html_url: "https://github.com/acme/validation/actions/runs/123",
    };
  });
  const provider: ActionsProvider = {
    dispatch,
    find: async () => remote,
    get: async () => remote!,
    artifacts: async () => [
      {
        id: 9,
        name: "analysis",
        archive_download_url:
          "https://api.github.com/repos/acme/validation/actions/artifacts/9/zip",
      },
    ],
    download: async () => new Uint8Array([80, 75]).buffer,
  };
  const service = githubActionsService(db, provider, async () => "fixture");
  const ctx = {
    runId: run.id,
    agent: f.ceo,
    config: {
      repository: "acme/validation",
      workflow: "analysis.yml",
      ref: "main",
      githubSecretRef: randomUUID(),
      inputs: { collect: true, count: 3 },
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    context: { issueId: f.p.directionIssueId },
    onLog: async () => {},
  };
  return {
    service,
    ctx,
    dispatch,
    provider,
    complete: () => {
      remote = { ...remote!, status: "completed", conclusion: "success" };
    },
  };
}
describe("GitHub Actions durable runtime", () => {
  it("dispatches once, reconciles after restart, retrieves artifacts and scopes company access", async () => {
    const f = await programme(),
      actions = await actionFixture(f);
    const pending = await actions.service.execute(actions.ctx);
    expect(pending.resultJson).toMatchObject({
      pending: true,
      accepted: false,
    });
    await actions.service.execute(actions.ctx);
    expect(actions.dispatch).toHaveBeenCalledTimes(1);
    actions.complete();
    const [row] = await db
      .select()
      .from(githubActionRuns)
      .where(eq(githubActionRuns.paperclipRunId, actions.ctx.runId));
    const recovered = await githubActionsService(
      db,
      actions.provider,
      async () => "fixture",
    ).reconcile(row.id);
    expect(recovered).toMatchObject({
      status: "completed",
      conclusion: "success",
      externalRunId: "123",
    });
    await actions.service.reconcile(row.id);
    expect(
      await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.createdByRunId, actions.ctx.runId)),
    ).toHaveLength(1);
    expect(
      (await actions.service.retrieveArtifact(f.c.id, row.id, 9)).byteLength,
    ).toBe(2);
    await expect(
      actions.service.retrieveArtifact(randomUUID(), row.id, 9),
    ).rejects.toThrow(/company/);
  });
  it("does not retry ambiguous external dispatch or dispatch against another company repository", async () => {
    const f = await programme(),
      actions = await actionFixture(f);
    actions.provider.dispatch = vi.fn(async () => {
      throw new Error("network ambiguity");
    });
    const service = githubActionsService(
      db,
      actions.provider,
      async () => "fixture",
    );
    expect((await service.execute(actions.ctx)).errorCode).toBe(
      "actions_dispatch_unknown",
    );
    await service.execute(actions.ctx);
    expect(actions.provider.dispatch).toHaveBeenCalledTimes(1);
    await expect(
      service.execute({
        ...actions.ctx,
        config: { ...actions.ctx.config, repository: "other/company" },
      }),
    ).rejects.toThrow(/company/);
  });
});

describe("physical Jules admission", () => {
  async function profileSetup() {
    const f = await programme(),
      [source] = await db
        .insert(companyJulesSources)
        .values({
          companyId: f.c.id,
          repository: `acme/${f.c.id}`,
          source: "sources/fixture",
        })
        .returning();
    const profiles = await db
      .insert(julesProfiles)
      .values(
        [1, 2].map((i) => ({
          name: `${f.c.id}-${i}`,
          secretRef: randomUUID(),
          capabilities: [],
        })),
      )
      .returning();
    await db
      .insert(julesProfileSources)
      .values(
        profiles.map((p) => ({ profileId: p.id, companySourceId: source.id })),
      );
    return {
      ...f,
      source,
      profiles,
      broker: julesCapacityBroker(db, { resolveSecret: async () => "fixture" }),
    };
  }
  async function runFor(f: Awaited<ReturnType<typeof programme>>) {
    return db
      .insert(heartbeatRuns)
      .values({
        companyId: f.c.id,
        agentId: f.ceo.id,
        invocationSource: "on_demand",
        triggerDetail: "manual",
        status: "running",
      })
      .returning()
      .then((r) => r[0]);
  }
  it("shares starts across profiles/companies, has no reserve, and caps Paperclip at 90", async () => {
    const f = await profileSetup(),
      run = await runFor(f),
      other = await company();
    await db.insert(julesCapacityEvents).values(
      Array.from({ length: 90 }, (_, i) => ({
        profileId: f.profiles[i % 2].id,
        companyId: other.c.id,
        eventType: "session_started",
      })),
    );
    expect(
      await f.broker.admit({
        companyId: f.c.id,
        paperclipRunId: run.id,
        requiredCapabilities: [],
        writeScopes: ["site/**"],
      }),
    ).toMatchObject({ kind: "DENIED", code: "QUOTA_EXHAUSTED" });
    await db
      .delete(julesCapacityEvents)
      .where(eq(julesCapacityEvents.companyId, other.c.id));
  });
  it("allows disjoint writes, rejects collisions and counts all reservations toward concurrency", async () => {
    const f = await profileSetup(),
      r1 = await runFor(f),
      r2 = await runFor(f),
      r3 = await runFor(f),
      r4 = await runFor(f);
    const admission = (runId: string, scope: string) =>
      f.broker.admit({
        companyId: f.c.id,
        paperclipRunId: runId,
        requiredCapabilities: [],
        writeScopes: [scope],
      });
    expect((await admission(r1.id, "site/a/**")).kind).toBe("ADMITTED");
    expect(await admission(r2.id, "site/a/index.html")).toMatchObject({
      kind: "DENIED",
      code: "WRITE_SCOPE_CONFLICT",
    });
    expect((await admission(r2.id, "site/b/**")).kind).toBe("ADMITTED");
    expect((await admission(r3.id, "site/c/**")).kind).toBe("ADMITTED");
    expect(await admission(r4.id, "site/d/**")).toMatchObject({
      kind: "DENIED",
      code: "CONCURRENCY_EXHAUSTED",
    });
    await db
      .delete(julesRepositoryLeases)
      .where(eq(julesRepositoryLeases.companyId, f.c.id));
  });
});

describe("fixture vertical validation slice", () => {
  it("runs vision → collection → Actions → Nodepad candidate → fake door → founder reflection without product engineering", async () => {
    const f = await programme(),
      { service, state } = await bind(f),
      programmes = validationProgrammeService(db);
    expect(f.p.visionGoalId).toBe(f.vision.id);
    expect(state.researchGaps).toContain("customer_language");
    const scout = await issueService(db).create(f.c.id, {
      title: "Collect community customer language",
      assigneeAgentId: f.ceo.id,
      validationTask: validationTaskSchema.parse({
        workClass: "ethnography",
        hypothesisIds: ["H-021"],
        resolvesBlocker: true,
      }),
    });
    expect(
      (await inspectValidationDispatch(db, f.c.id, scout, f.ceo.id))?.runtime,
    ).toBe("hermes_local");
    await issueService(db).addComment(
      scout.id,
      "Collection source: github:acme/validation/collection.md",
      { agentId: f.ceo.id },
    );
    const actions = await actionFixture(f);
    await actions.service.execute(actions.ctx);
    actions.complete();
    const [actionRow] = await db
      .select()
      .from(githubActionRuns)
      .where(eq(githubActionRuns.paperclipRunId, actions.ctx.runId));
    await actions.service.reconcile(actionRow.id);
    await service.submit(f.c.id, f.ceo.id, {
      type: "evidence_submission" as const,
      idempotencyKey: "collection",
      hypothesisId: "H-021",
      sourceRef: "github:acme/validation/collection.md",
      contentHash: "c".repeat(64),
      pipelineRunRef: `github-actions:${actionRow.id}`,
      summary: "Customer language candidate",
    });
    state.revision = "r2";
    state.interviews = [interview(1), interview(2), interview(3)];
    state.hypotheses[0].blockedReason = null;
    state.hypotheses[0].directCount = 3;
    state.hypotheses[0].lastMaterialAt = new Date().toISOString();
    state.materialChanges = ["H-021"];
    state.evidence = [
      "target_customer:1",
      "problem:1",
      "customer_language:1",
      "proposition:1",
      "counter_hypothesis:1",
    ];
    await service.sync(f.c.id);
    const app = appFor(f.c.id, f.ceo.id);
    await request(app)
      .post(`/api/companies/${f.c.id}/validation/reporter`)
      .set("idempotency-key", "report")
      .send({
        assessment: "Direct evidence received",
        warnings: [],
        sourceRefs: ["r2"],
      });
    expect(wakeup).toHaveBeenCalledWith(
      f.ceo.id,
      expect.objectContaining({ reason: "validation_reporter_ready" }),
    );
    const summary = await programmes.summary(f.c.id);
    expect(summary.nextActions[0].hypothesisId).toBe("H-021");
    const fakeDoor = await issueService(db).create(f.c.id, {
      title: "Fake-door pricing experiment",
      assigneeAgentId: f.ceo.id,
      validationTask: validationTaskSchema.parse({
        workClass: "fake_door",
        hypothesisIds: ["H-021"],
        experimentQuestion: "Will users join?",
        behavioralMetric: "Qualified signups",
        writeScopes: ["site/**"],
      }),
    });
    expect(
      (await inspectValidationDispatch(db, f.c.id, fakeDoor, f.ceo.id))
        ?.runtime,
    ).toBe("jules");
    const [profile] = await db
      .insert(julesProfiles)
      .values({ name: `slice-${f.c.id}`, secretRef: randomUUID() })
      .returning();
    const [source] = await db
      .insert(companyJulesSources)
      .values({
        companyId: f.c.id,
        repository: "acme/validation",
        source: "sources/fixture",
      })
      .returning();
    await db
      .insert(julesProfileSources)
      .values({ profileId: profile.id, companySourceId: source.id });
    const [julesRun] = await db
      .insert(heartbeatRuns)
      .values({
        companyId: f.c.id,
        agentId: f.ceo.id,
        invocationSource: "on_demand",
        triggerDetail: "manual",
        status: "running",
      })
      .returning();
    const admission = await julesCapacityBroker(db, {
      resolveSecret: async () => "fixture",
    }).admit({
      companyId: f.c.id,
      paperclipRunId: julesRun.id,
      issueId: fakeDoor.id,
      requiredCapabilities: [],
      writeScopes: ["site/**"],
    });
    expect(admission.kind).toBe("ADMITTED");
    const completed = vi.fn();
    const lifecycle = julesSessionService(db, { onRemoteCompleted: completed });
    const session = await lifecycle.attachDispatchedSession({
      companyId: f.c.id,
      profileId: profile.id,
      companySourceId: source.id,
      paperclipRunId: julesRun.id,
      julesSessionId: "fixture-remote",
      agentId: f.ceo.id,
      issueId: fakeDoor.id,
      remoteState: "IN_PROGRESS",
    });
    const result = await lifecycle.reconcile(session, {
      getSession: async () => ({
        id: "fixture-remote",
        state: "COMPLETED",
        outputs: [
          { pullRequest: { url: "https://github.com/acme/validation/pull/1" } },
        ],
      }),
      listActivities: async () => ({
        items: [
          { id: "result-returned", createTime: new Date().toISOString() },
        ],
      }),
    });
    expect(result.status).toBe("COMPLETED_UNVALIDATED");
    expect(completed).toHaveBeenCalledOnce();
    await db.insert(issueWorkProducts).values({
      companyId: f.c.id,
      issueId: fakeDoor.id,
      type: "artifact",
      provider: "fixture-jules",
      title: "Fake-door result",
      status: "candidate",
      reviewState: "pending",
      url: "https://github.com/acme/validation/pull/1",
    });
    await programmes.cycle(
      f.c.id,
      {
        expectedProgress: "Problem evidence",
        actualProgress: "Interviews analyzed; fake door candidate",
        materialChanges: ["r2"],
        previousDecisionReview: "Interview priority unlocked a test",
        highestImpactUncertainty: "Behavioral response",
        blockers: ["External simulation pending"],
        agentResolvable: ["Analyze experiment"],
        founderActions: ["Review continuation"],
        stopWork: ["Generic desk research"],
        mustWinOutcomes: ["Interpret fake-door signal"],
        founderQuestions: ["Continue this test?"],
        reporterAssessment: "Evidence debt decreasing",
      },
      "cycle",
      f.ceo.id,
    );
    const question = await request(app)
      .post(`/api/companies/${f.c.id}/validation/decision-requests`)
      .set("idempotency-key", "continue")
      .send({
        ...decision,
        question: "Continue validation?",
        requiredAuthority: "founder",
      });
    expect(question.status).toBe(201);
    expect(
      (
        await request(appFor(f.c.id))
          .post(
            `/api/companies/${f.c.id}/validation/decision-requests/${question.body.id}/resolve`,
          )
          .send({ answer: "Continue testing; do not build a product" })
      ).status,
    ).toBe(200);
    await expect(
      issueService(db).create(f.c.id, {
        title: "Build production backend",
        assigneeAgentId: f.ceo.id,
        validationTask: validationTaskSchema.parse({
          workClass: "product_backend",
        }),
      }),
    ).rejects.toThrow(/FOUNDER_ENGINEERING_DEPENDENCY/);
    const current = await db
      .select()
      .from(issues)
      .where(eq(issues.companyId, f.c.id));
    expect(
      current.some((i) => i.validationTask?.workClass === "product_backend"),
    ).toBe(false);
    expect(
      (await programmes.summary(f.c.id)).latestCycle?.payload.mustWinOutcomes,
    ).toHaveLength(1);
  });
});

// Agency fixtures exercise native PostgreSQL, task assignment, artifacts and Nodepad projection.
// Remote providers remain explicit fixtures; none of these tests constitutes live validation.
describe("Agency workforce native integration", () => {
  async function workforceFixture() {
    const f = await programme(),
      { state, service: nodepad } = await bind(f);
    state.hypotheses[0].blockedReason = null;
    state.hypotheses[0].secondaryCount = 0;
    state.hypotheses[0].directCount = 3;
    state.interviews = [interview(1), interview(2), interview(3)];
    state.researchGaps = [
      "customer_language",
      "dataset_analysis",
      "counter_hypothesis",
      "pricing_wtp",
      "fake_door",
      "go_pivot_stop",
      "founder_intelligence",
    ];
    state.evidence = [
      "target_customer:1",
      "problem:1",
      "customer_language:1",
      "proposition:1",
      "counter_hypothesis:1",
    ];
    await nodepad.sync(f.c.id);
    await db
      .update(validationProgrammes)
      .set({ phase: "CONCENTRATE" })
      .where(eq(validationProgrammes.companyId, f.c.id));
    const wake = vi.fn(async () => ({ id: "fixture" }));
    const workforce = workforceService(db, {
      runtimes: { "github-actions": true, hermes_local: true, jules: true },
      wake,
    });
    return { ...f, state, nodepad, workforce, wake };
  }
  function requestNeed(
    gap: string,
    stage: string,
    workClass: string,
    key = gap,
  ) {
    return {
      eventKey: key,
      eventType: "research_gap",
      gap,
      stage,
      hypothesisId: "H-021",
      sourceGapRef: gap,
      datasetRefs: [],
      reason:
        "Resolve one current uncertainty with minimum cost and clear stop condition",
      validationTask: validationTaskSchema.parse({
        workClass,
        hypothesisIds: ["H-021"],
        writeScopes: stage === "frontend" ? ["website/**"] : [],
        experimentQuestion: "Will visitors request a human conversation?",
        behavioralMetric: "Qualified requests / qualified visitors",
      }),
      economics: {
        informationGain: 0.8,
        timeToSignalHours: 1,
        cashCostCents: 0,
        founderMinutes: 5,
        julesStarts: 0,
        externalInteractionBurden: "None",
      },
    };
  }
  it("imports all 45 once, keeps identities stable, dormant and company-scoped", async () => {
    const f = await workforceFixture(),
      imports = workforceImportService(db),
      before = await imports.roster(f.c.id);
    expect(before).toHaveLength(45);
    expect(before.filter((m) => m.state === "DORMANT")).toHaveLength(44);
    expect(before.filter((m) => m.state === "AVAILABLE")).toHaveLength(1);
    const again = await imports.importWorkforce(f.c.id, "founder");
    expect(again).toMatchObject({ created: 0, changed: 0, reused: 45 });
    expect((await imports.roster(f.c.id)).map((m) => m.agentId).sort()).toEqual(
      before.map((m) => m.agentId).sort(),
    );
    const native = await db
      .select()
      .from(agents)
      .where(eq(agents.companyId, f.c.id));
    expect(native).toHaveLength(46);
    expect(
      native
        .filter(
          (a) =>
            a.id !== f.ceo.id &&
            a.metadata?.agencyId !== "founder-intelligence-reporter",
        )
        .every(
          (a) =>
            (a.runtimeConfig.heartbeat as { intervalSec: number })
              .intervalSec === 0,
        ),
    ).toBe(true);
    const legacy = await company();
    await expect(
      imports.importWorkforce(legacy.c.id, "founder"),
    ).rejects.toThrow();
    expect(await imports.roster(legacy.c.id)).toHaveLength(0);
  });
  it("retains override policy, detects changed and removed upstream definitions without deleting history", async () => {
    const f = await workforceFixture(),
      imports = workforceImportService(db),
      [member] = await imports.roster(f.c.id);
    await imports.override(
      f.c.id,
      member.id,
      { disabled: true, requireFounderApproval: true },
      "founder",
    );
    const changed = structuredClone(canonicalWorkforce);
    changed.agents.find((a) => a.agencyId === member.agencyId)!.description +=
      " Updated upstream";
    expect(
      (await imports.importWorkforce(f.c.id, "founder", changed)).changed,
    ).toBe(1);
    expect(
      (await imports.roster(f.c.id)).find((m) => m.id === member.id),
    ).toMatchObject({
      state: "DISABLED",
      drift: "changed",
      overrides: { disabled: true },
    });
    const removed = structuredClone(changed);
    removed.agents = removed.agents.filter(
      (a) => a.agencyId !== member.agencyId,
    );
    removed.sourceAliases = Object.fromEntries(
      Object.entries(removed.sourceAliases).filter(
        ([, path]) => path !== member.definition.sourcePath,
      ),
    );
    removed.capabilities = removed.capabilities.filter(
      (c) => !c.agentIds.includes(member.agencyId),
    );
    removed.workflows = removed.workflows.filter(
      (w) => !w.steps.some((s) => s.agencyId === member.agencyId),
    );
    await imports.importWorkforce(f.c.id, "founder", removed);
    expect(
      (await imports.roster(f.c.id)).find((m) => m.id === member.id),
    ).toMatchObject({
      state: "DISABLED",
      drift: "upstream_removed",
      agentId: member.agentId,
    });
    await expect(
      imports.override(
        f.c.id,
        member.id,
        { requireFounderApproval: false },
        "founder",
      ),
    ).rejects.toThrow();
  });
  it("prevents direct dormant assignment and ensures idempotent activation with immutable intent", async () => {
    const f = await workforceFixture(),
      members = await workforceImportService(db).roster(f.c.id),
      scout = members.find((m) => m.agencyId === "community-scout")!;
    const n = requestNeed(
      "customer_language",
      "collection",
      "community_exploration",
    );
    await expect(
      issueService(db).create(f.c.id, {
        title: "Bypass activation",
        assigneeAgentId: scout.agentId,
        validationTask: n.validationTask,
      }),
    ).rejects.toThrow(/Dormant/);
    const a = await f.workforce.activate(f.c.id, n, f.ceo.id);
    expect(a.status).toBe("ACTIVATED");
    if (!("activation" in a)) throw new Error("Missing activation");
    expect(f.wake).toHaveBeenCalledTimes(1);
    expect((await f.workforce.activate(f.c.id, n, f.ceo.id)).status).toBe(
      "REUSED",
    );
    expect(f.wake).toHaveBeenCalledTimes(1);
    await expect(
      f.workforce.activate(
        f.c.id,
        { ...n, reason: "Changed intent" },
        f.ceo.id,
      ),
    ).rejects.toThrow(/different intent/);
    await expect(
      issueService(db).update(a.activation.issueId!, {
        validationTask: { ...n.validationTask, workClass: "analysis" },
      }),
    ).rejects.toThrow(/intent changed/);
    await expect(
      workforceImportService(db).override(
        f.c.id,
        scout.id,
        { disabled: true },
        "founder",
      ),
    ).rejects.toThrow(/active work/);
    await expect(
      f.nodepad.submit(f.c.id, scout.agentId, {
        type: "evidence_submission",
        hypothesisId: "H-021",
        summary: "Raw collection is not accepted analysis",
        sourceRefs: ["public:thread"],
        idempotencyKey: "scout-write",
      }),
    ).rejects.toThrow();
  });
  it("golden slice: collection → analysis → design → frontend → skeptic → Venture Judge → CEO/Reporter/founder queue", async () => {
    const f = await workforceFixture(),
      trace: Array<{ agencyId: string; runtime: string }> = [];
    async function run(
      n: ReturnType<typeof requestNeed>,
      expected: string,
      runtime: string,
    ) {
      const activated = await f.workforce.activate(f.c.id, n, f.ceo.id);
      expect(activated.status).toBe("ACTIVATED");
      if (!("activation" in activated)) throw new Error("Not activated");
      const a = activated.activation,
        [m] = await db
          .select()
          .from(workforceMembers)
          .where(eq(workforceMembers.id, a.memberId));
      expect(m.agencyId).toBe(expected);
      expect(a.runtime).toBe(runtime);
      trace.push({ agencyId: m.agencyId, runtime: a.runtime });
      const [artifact] = await db
        .insert(issueWorkProducts)
        .values({
          companyId: f.c.id,
          issueId: a.issueId!,
          type: "document",
          provider: "fixture",
          title: `${expected} findings`,
          status: "ready_for_review",
          summary: "Traceable fixture findings; not live customer evidence",
        })
        .returning();
      const report = {
        report: `${expected}: preserve uncertainty and contradiction. Artifact ${artifact.id}`,
        artifactIds: [artifact.id],
        nodepadRefs: [n.sourceGapRef],
        outcome: "reusable_artifact",
        ...(expected === "venture-judge"
          ? { ventureDecision: "MORE_VALIDATION_REQUIRED" }
          : {}),
      };
      if (expected === "customer-investigator") {
        const candidate = {
          type: "evidence_submission" as const,
          hypothesisId: "H-021",
          summary: "Analyzed interview findings with provenance",
          sourceRef: `artifact:${artifact.id}`,
          contentHash: "a".repeat(64),
          pipelineRunRef: `github-actions:fixture:${a.id}`,
          idempotencyKey: a.id,
        };
        const submitted = await f.nodepad.submit(f.c.id, m.agentId, candidate);
        expect(submitted.status).toBe("submitted");
        f.state.evidence.push(`candidate:${a.id}`);
        await f.nodepad.sync(f.c.id);
      }
      await f.workforce.complete(f.c.id, a.id, report, m.agentId);
      expect(
        (
          await db
            .select()
            .from(workforceMembers)
            .where(eq(workforceMembers.id, m.id))
        )[0].state,
      ).toBe(m.definition.activation.defaultState);
      await expect(
        f.workforce.complete(
          f.c.id,
          a.id,
          { ...report, report: "CEO rewrites findings" },
          f.ceo.id,
        ),
      ).rejects.toThrow(/assigned specialist/);
      return { a, m };
    }
    await run(
      requestNeed("customer_language", "collection", "community_exploration"),
      "community-scout",
      "hermes_local",
    );
    const n = requestNeed("dataset_analysis", "analysis", "analysis");
    n.datasetRefs = ["artifact:collected-dataset"];
    await run(n, "customer-investigator", "github-actions");
    await run(
      requestNeed("fake_door", "design", "analysis", "design"),
      "fake-door-designer",
      "github-actions",
    );
    await run(
      requestNeed("fake_door", "frontend", "fake_door", "frontend"),
      "fake-door-designer",
      "jules",
    );
    const skeptic = requestNeed(
      "pricing_wtp",
      "evaluation",
      "experiment_evaluation",
    );
    skeptic.eventType = "experiment_completed";
    await run(skeptic, "wtp-skeptic", "github-actions");
    await db
      .update(validationProgrammes)
      .set({ phase: "FOUNDER_HANDOFF" })
      .where(eq(validationProgrammes.companyId, f.c.id));
    await run(
      requestNeed("go_pivot_stop", "decision", "synthesis"),
      "venture-judge",
      "github-actions",
    );
    const reporter = requestNeed("founder_intelligence", "analysis", "report");
    await run(reporter, "founder-intelligence-reporter", "github-actions");
    expect(
      (await validationProgrammeService(db).summary(f.c.id)).latestReporter
        ?.payload.independent,
    ).toBe(true);
    const summary = await assembleCeoContext(db, f.c.id);
    expect(JSON.stringify(summary)).toContain("workforce");
    expect(JSON.stringify(summary)).toContain("wtp-skeptic");
    const response = await request(appFor(f.c.id, f.ceo.id))
      .post(`/api/companies/${f.c.id}/validation/decision-requests`)
      .set("idempotency-key", "agency-founder")
      .send({
        ...decision,
        category: "pivot",
        requiredAuthority: "founder",
        question: "Approve a smaller segment after independent review?",
      });
    expect(response.status).toBe(201);
    expect(response.body.payload.authority).toBe("founder");
    expect(trace).toHaveLength(7);
    expect(f.state.hypotheses[0].qualification).toBe("unqualified");
    expect(
      (await nodepadService(db).binding(f.c.id))?.snapshot?.hypotheses[0]
        .qualification,
    ).toBe("unqualified");
  });
  it("enforces actual Nodepad scopes, proposal-only writes and company boundaries", async () => {
    const f = await workforceFixture(),
      n = requestNeed(
        "customer_language",
        "collection",
        "community_exploration",
      ),
      a = await f.workforce.activate(f.c.id, n, f.ceo.id);
    if (!("activation" in a)) throw new Error("Missing activation");
    const [m] = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.id, a.activation.memberId));
    const app = appFor(f.c.id, m.agentId),
      base = `/api/companies/${f.c.id}/workforce`;
    const context = await request(app).get(
      `${base}/nodepad?scope=nodepad.context`,
    );
    expect(context.status).toBe(200);
    expect(JSON.stringify(context.body)).not.toContain("apiKeySecretRef");
    expect(
      (await request(app).get(`${base}/nodepad?scope=nodepad.evidence`)).status,
    ).toBe(403);
    expect(
      (
        await request(app).get(
          `/api/companies/${randomUUID()}/workforce/nodepad?scope=nodepad.context`,
        )
      ).status,
    ).toBe(403);
    const proposal = {
      operation: "research_gap",
      hypothesisId: "H-021",
      sourceRefs: ["public:thread"],
      summary: "Need human evidence about buying authority",
      idempotencyKey: "gap-proposal",
    };
    expect(
      (await request(app).post(`${base}/proposals`).send(proposal)).body.status,
    ).toBe("pending_nodepad");
    expect(
      (
        await request(app)
          .post(`${base}/proposals`)
          .send({ ...proposal, qualification: "validated" })
      ).status,
    ).toBe(400);
    await expect(
      authorizeWorkforceNodepad(db, f.c.id, m.agentId, "qualification"),
    ).rejects.toThrow(/forbidden/);
    await expect(
      authorizeWorkforceNodepad(
        db,
        f.c.id,
        m.agentId,
        "research_gap",
        "OTHER-H",
      ),
    ).rejects.toThrow(/active specialist hypothesis/);
    expect((await request(app).get(base)).status).toBe(403); // specialist cannot inspect other specialists' independent findings
    await f.workforce.complete(
      f.c.id,
      a.activation.id,
      {
        report: "Human interview required; no further automated collection",
        artifactIds: [],
        nodepadRefs: [],
        outcome: "blocked",
      },
      m.agentId,
    );
    expect(
      (await request(app).get(`${base}/nodepad?scope=nodepad.context`)).status,
    ).toBe(403);
    expect(
      (await f.workforce.inspect(f.c.id)).members.find((x) => x.id === m.id)
        ?.state,
    ).toBe("BLOCKED");
  });
  it("stops terminal task execution and awaits an explicit traceable finding without inventing success", async () => {
    const f = await workforceFixture(),
      a = await f.workforce.activate(
        f.c.id,
        requestNeed("counter_hypothesis", "analysis", "analysis"),
        f.ceo.id,
      );
    if (!("activation" in a)) throw new Error("Missing activation");
    await issueService(db).update(a.activation.issueId!, { status: "done" });
    const state = await f.workforce.inspect(f.c.id);
    expect(
      state.members.find((m) => m.id === a.activation.memberId)?.state,
    ).toBe("WAITING");
    expect(state.activations[0].status).toBe("AWAITING_RESULT");
    const metrics = await workforceMetrics(db, f.c.id);
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.busyWorkRatio.value).toBeNull();
    const member = state.members.find((m) => m.id === a.activation.memberId)!;
    await f.workforce.complete(
      f.c.id,
      a.activation.id,
      {
        report: "No material result; stop resource use",
        artifactIds: [],
        nodepadRefs: [],
        outcome: "no_material_result",
      },
      member.agentId,
    );
    expect(
      (await f.workforce.inspect(f.c.id)).members.find(
        (m) => m.id === member.id,
      )?.state,
    ).toBe("DORMANT");
  });
  it("schedules only the independent Reporter once per day, even at human blockers", async () => {
    const f = await workforceFixture();
    f.state.hypotheses[0].blockedReason = "BLOCKED_ON_HUMAN_INTERVIEW";
    await f.nodepad.sync(f.c.id);
    const [p] = await db
      .select()
      .from(validationProgrammes)
      .where(eq(validationProgrammes.companyId, f.c.id));
    await db
      .update(validationProgrammes)
      .set({
        runtimeBindings: {
          ...p.runtimeBindings,
          "github-actions": {
            repository: "acme/validation",
            workflow: "workforce.yml",
            ref: "main",
            githubSecretRef: randomUUID(),
            inputs: {},
            workforcePacketInput: "workforce_packet",
          },
        },
      })
      .where(eq(validationProgrammes.companyId, f.c.id));
    const later = new Date(Date.now() + 2 * 86400_000),
      wake = vi.fn(async () => ({ id: "scheduled" }));
    expect(await tickWorkforceReporters(db, later, wake)).toBe(1);
    expect(await tickWorkforceReporters(db, later, wake)).toBe(0);
    expect(wake).toHaveBeenCalledTimes(1);
    const state = await f.workforce.inspect(f.c.id);
    expect(state.members.filter((m) => m.state === "ACTIVE")).toHaveLength(1);
    expect(state.members.find((m) => m.state === "ACTIVE")?.agencyId).toBe(
      "founder-intelligence-reporter",
    );
  });
  it("reuses legacy logical workers while retiring backend/duplicate seats with their history intact", async () => {
    const f = await company(),
      [customer] = await db
        .insert(agents)
        .values({
          companyId: f.c.id,
          name: "Customer old",
          role: "general",
          adapterType: "jules",
          metadata: { founderosTemplateId: "customer,customer-researcher" },
        })
        .returning(),
      [engineer] = await db
        .insert(agents)
        .values({
          companyId: f.c.id,
          name: "Product Engineer",
          role: "engineer",
          adapterType: "jules",
          metadata: { founderosTemplateId: "engineering,product-engineer" },
        })
        .returning();
    await validationProgrammeService(db).start(
      f.c.id,
      { ceoAgentId: f.ceo.id, visionGoalId: f.vision.id },
      "founder",
    );
    const roster = await workforceImportService(db).roster(f.c.id);
    expect(roster).toHaveLength(45);
    expect(
      roster.find((m) => m.agencyId === "customer-investigator")?.agentId,
    ).toBe(customer.id);
    expect(
      (await db.select().from(agents).where(eq(agents.id, engineer.id)))[0],
    ).toMatchObject({
      status: "paused",
      pauseReason: expect.stringContaining("Superseded"),
    });
  });

  it("withdraws stale-phase execution and frees local work without pretending a remote job stopped", async () => {
    const f = await workforceFixture(),
      a = await f.workforce.activate(
        f.c.id,
        requestNeed("counter_hypothesis", "analysis", "analysis"),
        f.ceo.id,
      );
    if (!("activation" in a)) throw new Error("Missing activation");
    const cancel = vi.fn(async () => 1),
      control = workforceControlService(db, cancel);
    await db
      .update(validationProgrammes)
      .set({ phase: "REFINE" })
      .where(eq(validationProgrammes.companyId, f.c.id));
    await control.stopInvalid();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(
      (await f.workforce.inspect(f.c.id)).members.find(
        (m) => m.id === a.activation.memberId,
      )?.state,
    ).toBe("DORMANT");
    await expect(
      f.workforce.complete(
        f.c.id,
        a.activation.id,
        {
          report: "Late cancelled work",
          artifactIds: [],
          nodepadRefs: [],
          outcome: "no_material_result",
        },
        "founder",
        true,
      ),
    ).rejects.toThrow(/cancelled/);
    const b = await f.workforce.activate(
      f.c.id,
      requestNeed("counter_hypothesis", "analysis", "analysis", "remote-stop"),
      f.ceo.id,
    );
    if (!("activation" in b)) throw new Error("Missing remote activation");
    const [member] = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.id, b.activation.memberId));
    const [run] = await db
      .insert(heartbeatRuns)
      .values({
        companyId: f.c.id,
        agentId: member.agentId,
        status: "succeeded",
        invocationSource: "automation",
      })
      .returning();
    const [remote] = await db
      .insert(githubActionRuns)
      .values({
        companyId: f.c.id,
        paperclipRunId: run.id,
        issueId: b.activation.issueId,
        repository: "acme/validation",
        workflow: "workforce.yml",
        ref: "main",
        credentialSecretRef: randomUUID(),
        status: "dispatch_unknown",
      })
      .returning();
    expect(
      (
        await control.stop(
          f.c.id,
          b.activation.id,
          "CEO reprioritized",
          "founder",
        )
      ).status,
    ).toBe("REMOTE_STOP_PENDING");
    expect(
      (await f.workforce.inspect(f.c.id)).members.find(
        (m) => m.id === member.id,
      )?.state,
    ).toBe("WAITING");
    await db
      .update(githubActionRuns)
      .set({ status: "completed", conclusion: "cancelled" })
      .where(eq(githubActionRuns.id, remote.id));
    expect(
      (
        await control.stop(
          f.c.id,
          b.activation.id,
          "Remote cancellation reconciled",
          "founder",
        )
      ).status,
    ).toBe("CANCELLED");
  });
  it("rejects a missing typed evidence operation without a hypothesis fallback", async () => {
    const f = await workforceFixture(),
      n = requestNeed("dataset_analysis", "analysis", "analysis");
    n.datasetRefs = ["fixture:dataset"];
    const a = await f.workforce.activate(f.c.id, n, f.ceo.id);
    if (!("activation" in a)) throw new Error("Missing activation");
    const [member] = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.id, a.activation.memberId));
    const submit = vi.fn(),
      provider = {
        ...fixtureProvider(f.state),
        mode: "live" as const,
        submitEvidence:
          undefined as unknown as NodepadProvider["submitEvidence"],
      };
    await expect(
      nodepadService(db, provider, async () => "fixture").submit(
        f.c.id,
        member.agentId,
        {
          hypothesisId: "H-021",
          summary: "Analysis",
          sourceRef: "fixture:dataset",
          contentHash: "a".repeat(64),
          pipelineRunRef: "fixture:analysis",
          type: "evidence_submission",
          idempotencyKey: "unsafe-live",
        },
      ),
    ).rejects.toThrow(/submitEvidence/);
    expect(submit).not.toHaveBeenCalled();
  });

  it("authorizes every discriminated candidate against its own exact grant", async () => {
    const f = await workforceFixture(),
      need = requestNeed("dataset_analysis", "analysis", "analysis");
    need.datasetRefs = ["fixture:dataset"];
    const activation = await f.workforce.activate(f.c.id, need, f.ceo.id);
    if (!("activation" in activation)) throw new Error("Missing activation");
    const [member] = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.id, activation.activation.memberId));
    for (const granted of nodepadCandidates) {
      await db
        .update(workforceMembers)
        .set({
          definition: {
            ...member.definition,
            nodepad: { ...member.definition.nodepad, writes: [granted.type] },
          },
        })
        .where(eq(workforceMembers.id, member.id));
      for (const candidate of nodepadCandidates) {
        const request = {
          ...candidate,
          idempotencyKey: `${granted.type}:${candidate.type}`,
        };
        if (candidate.type === granted.type)
          expect(
            (await f.nodepad.submit(f.c.id, member.agentId, request)).status,
          ).toBe("submitted");
        else
          await expect(
            f.nodepad.submit(f.c.id, member.agentId, request),
          ).rejects.toThrow(/operation is forbidden/);
      }
    }
  });

  it("sends an authorized evidence submission through the HTTP evidence operation only", async () => {
    const f = await workforceFixture(),
      need = requestNeed("dataset_analysis", "analysis", "analysis");
    need.datasetRefs = ["fixture:dataset"];
    const activated = await f.workforce.activate(f.c.id, need, f.ceo.id);
    if (!("activation" in activated)) throw new Error("Missing activation");
    const [member] = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.id, activated.activation.memberId));
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidateId: "evidence:receipt",
            companyId: f.c.id,
            workspaceId: f.state.workspaceId,
          }),
          { status: 201 },
        ),
    );
    const candidate = nodepadCandidates[0];
    expect(
      (
        await nodepadService(
          db,
          nodepadHttpProvider(fetcher as typeof fetch),
          async () => "fixture-key",
        ).submit(f.c.id, member.agentId, candidate)
      ).status,
    ).toBe("submitted");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new URL(url).pathname.endsWith("/evidence")).toBe(true);
    expect(url).not.toContain("/hypotheses");
    expect(JSON.parse(init.body as string).candidate).toEqual(candidate);
  });
  it("never treats another candidate type as accepted evidence or reinterprets an idempotency key", async () => {
    const f = await workforceFixture(),
      evidence = nodepadCandidates[0],
      hypothesis = nodepadCandidates[2];
    const e = await f.nodepad.submit(f.c.id, f.ceo.id, evidence),
      h = await f.nodepad.submit(f.c.id, f.ceo.id, hypothesis);
    f.state.evidence.push(
      `candidate:${evidence.idempotencyKey}`,
      `candidate:${hypothesis.idempotencyKey}`,
    );
    await f.nodepad.sync(f.c.id);
    const rows = await db
      .select()
      .from(validationRecords)
      .where(
        and(
          eq(validationRecords.companyId, f.c.id),
          eq(validationRecords.kind, "nodepad_candidate"),
        ),
      );
    expect(rows.find((r) => r.id === e.id)?.status).toBe("accepted");
    expect(rows.find((r) => r.id === h.id)?.status).toBe("submitted");
    await expect(
      f.nodepad.submit(f.c.id, f.ceo.id, {
        ...hypothesis,
        idempotencyKey: evidence.idempotencyKey,
      }),
    ).rejects.toThrow(/Idempotency/);
    await expect(
      f.nodepad.submit(f.c.id, randomUUID(), evidence),
    ).rejects.toThrow(/company CEO/);
  });
});
