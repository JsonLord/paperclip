/// <reference path="../types/express.d.ts" />
import {
  actionsConfigSchema,
  githubActionsService,
} from "../services/validation/github-actions.js";
import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  workforceMembers,
  validationRecords,
  validationProgrammes,
  githubActionRuns,
  type Db,
} from "@paperclipai/db";
import {
  decisionJournalSchema,
  decisionRequestSchema,
  nodepadBindingSchema,
  pauseProgrammeSchema,
} from "@paperclipai/shared";
import { z } from "zod";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { forbidden, notFound } from "../errors.js";
import { validationProgrammeService } from "../services/validation/programmes.js";
import { assembleCeoContext } from "../services/validation/ceo-context.js";
import { nodepadService } from "../services/validation/nodepad.js";
import { decisionAuthority } from "../services/validation/decisions.js";
import { heartbeatService } from "../services/heartbeat.js";
import { issueService } from "../services/issues.js";

export function validationRoutes(db: Db) {
  const router = Router(),
    programmes = validationProgrammeService(db),
    nodepad = nodepadService(db);
  const company = (req: Request) => {
    const id = String(req.params.companyId);
    assertCompanyAccess(req, id);
    return id;
  };
  const actor = (req: Request) =>
    req.actor.type === "agent"
      ? req.actor.agentId!
      : (req.actor.userId ?? "board");
  const key = (req: Request) =>
    z.string().min(1).max(200).parse(req.header("idempotency-key"));
  async function manager(req: Request) {
    const id = company(req),
      p = await programmes.requireProgramme(id);
    if (req.actor.type === "agent" && req.actor.agentId !== p.ceoAgentId)
      throw forbidden("Programme CEO or founder required");
    return id;
  }
  async function wake(companyId: string, reason: string) {
    const p = await programmes.requireProgramme(companyId);
    await heartbeatService(db).wakeup(p.ceoAgentId, {
      source: "automation",
      triggerDetail: "system",
      reason,
      payload: { issueId: p.directionIssueId },
      contextSnapshot: { issueId: p.directionIssueId },
    });
  }
  router.put(
    "/companies/:companyId/validation/runtime-bindings/actions",
    async (req, res) => {
      assertBoard(req);
      const id = company(req),
        config = actionsConfigSchema.parse(req.body);
      const programme = await programmes.requireProgramme(id);
      const [updated] = await db
        .update(validationProgrammes)
        .set({
          runtimeBindings: {
            ...programme.runtimeBindings,
            "github-actions": config,
          },
          updatedAt: new Date(),
        })
        .where(eq(validationProgrammes.companyId, id))
        .returning();
      await programmes.audit(
        id,
        actor(req),
        "runtime.configured",
        programme.id,
        {
          runtime: "github-actions",
          repository: config.repository,
          workflow: config.workflow,
        },
      );
      res.json({
        status: "READY_CONFIG",
        runtime: "github-actions",
        repository: config.repository,
        workflow: config.workflow,
      });
    },
  );
  router.put(
    "/companies/:companyId/validation/runtime-bindings/:runtime",
    async (req, res) => {
      assertBoard(req);
      const id = company(req),
        runtime = z.enum(["hermes_local", "jules"]).parse(req.params.runtime);
      const config =
        runtime === "jules"
          ? z
              .object({
                repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
                startingBranch: z.string().min(1).max(200),
              })
              .strict()
              .parse(req.body)
          : z
              .object({
                model: z.string().min(1).max(200),
                timeoutSec: z.number().int().positive().max(3600).optional(),
              })
              .strict()
              .parse(req.body);
      const p = await programmes.requireProgramme(id);
      await db
        .update(validationProgrammes)
        .set({
          runtimeBindings: { ...p.runtimeBindings, [runtime]: config },
          updatedAt: new Date(),
        })
        .where(eq(validationProgrammes.companyId, id));
      await programmes.audit(id, actor(req), "runtime.configured", p.id, {
        runtime,
      });
      res.json({ status: "READY_CONFIG", runtime });
    },
  );
  router.post(
    "/companies/:companyId/validation/programme",
    async (req, res) => {
      assertBoard(req);
      res
        .status(201)
        .json(await programmes.start(company(req), req.body, actor(req)));
    },
  );
  router.get("/companies/:companyId/validation", async (req, res) => {
    res.json(await programmes.summary(await manager(req)));
  });
  router.post("/companies/:companyId/validation/pause", async (req, res) => {
    assertBoard(req);
    res.json(
      await programmes.pause(
        company(req),
        pauseProgrammeSchema.parse(req.body).reason,
        actor(req),
      ),
    );
  });
  router.post("/companies/:companyId/validation/resume", async (req, res) => {
    assertBoard(req);
    res.json(await programmes.pause(company(req), null, actor(req)));
  });
  router.post(
    "/companies/:companyId/validation/adaptations",
    async (req, res) => {
      res
        .status(201)
        .json(
          await programmes.propose(
            await manager(req),
            req.body,
            key(req),
            actor(req),
          ),
        );
    },
  );
  router.post(
    "/companies/:companyId/validation/adaptations/:id/apply",
    async (req, res) => {
      const id = await manager(req);
      res.json(
        await programmes.applyProposal(
          id,
          String(req.params.id),
          actor(req),
          req.actor.type === "board",
        ),
      );
    },
  );
  router.get(
    "/companies/:companyId/validation/ceo-context",
    async (req, res) => {
      res.json(await assembleCeoContext(db, await manager(req)));
    },
  );
  router.put(
    "/companies/:companyId/validation/founder-statement",
    async (req, res) => {
      const id = await manager(req);
      res.json(
        await programmes.statement(
          id,
          req.body,
          req.actor.type === "agent"
            ? { agentId: req.actor.agentId! }
            : { userId: req.actor.userId ?? "board" },
        ),
      );
    },
  );
  router.post("/companies/:companyId/validation/reporter", async (req, res) => {
    const id = company(req),
      report = z
        .object({
          assessment: z.string().min(1).max(8000),
          warnings: z.array(z.string().max(500)).max(30),
          sourceRefs: z.array(z.string().max(500)).max(30),
        })
        .strict()
        .parse(req.body);
    if (req.actor.type === "agent") {
      const [member] = await db
        .select()
        .from(workforceMembers)
        .where(
          and(
            eq(workforceMembers.companyId, id),
            eq(workforceMembers.agentId, actor(req)),
          ),
        );
      if (
        member &&
        (member.agencyId !== "founder-intelligence-reporter" ||
          member.state !== "ACTIVE")
      )
        throw forbidden(
          "Only the activated Founder Intelligence Reporter may submit Agency reporting",
        );
    }
    const record = await programmes.record(
      id,
      "reporter",
      key(req),
      actor(req),
      report,
    );
    await wake(id, "validation_reporter_ready");
    res.status(201).json(record);
  });
  router.post("/companies/:companyId/validation/cycles", async (req, res) => {
    const id = await manager(req);
    res
      .status(201)
      .json(await programmes.cycle(id, req.body, key(req), actor(req)));
  });
  router.post(
    "/companies/:companyId/validation/decisions",
    async (req, res) => {
      const id = await manager(req),
        parsed = decisionJournalSchema.parse(req.body);
      if (parsed.authority === "founder" && req.actor.type === "agent")
        throw forbidden("Founder decision requires board actor");
      // Strategic categories cannot be relabelled as CEO decisions in the journal.
      if (
        req.actor.type === "agent" &&
        (!parsed.reversible ||
          parsed.impact === "high" ||
          [
            "vision",
            "icp",
            "pivot",
            "pause",
            "budget",
            "market",
            "constraint",
            "positioning",
            "external_action",
          ].includes(parsed.category))
      )
        throw forbidden("Escalate this decision to founder queue");
      res
        .status(201)
        .json(
          await programmes.record(id, "decision", key(req), actor(req), parsed),
        );
    },
  );
  router.patch(
    "/companies/:companyId/validation/decisions/:id/review",
    async (req, res) => {
      const id = await manager(req),
        payload = z
          .object({
            actualResult: z.string().min(1).max(4000),
            disposition: z.enum(["keep", "revise", "reverse"]),
            signalOccurred: z.boolean(),
          })
          .strict()
          .parse(req.body);
      const [r] = await db
        .select()
        .from(validationRecords)
        .where(
          and(
            eq(validationRecords.id, String(req.params.id)),
            eq(validationRecords.companyId, id),
            eq(validationRecords.kind, "decision"),
          ),
        );
      if (!r) throw notFound("Decision not found");
      const [updated] = await db
        .update(validationRecords)
        .set({
          payload: { ...r.payload, review: payload },
          updatedAt: new Date(),
        })
        .where(eq(validationRecords.id, r.id))
        .returning();
      await programmes.audit(id, actor(req), "decision.reviewed", r.id);
      res.json(updated);
    },
  );
  router.post(
    "/companies/:companyId/validation/decision-requests",
    async (req, res) => {
      const id = company(req),
        request = decisionRequestSchema.parse(req.body),
        authority = decisionAuthority(request);
      const record = await programmes.record(
        id,
        "decision_request",
        key(req),
        actor(req),
        { ...request, ...authority },
        `${authority.queue}_pending`,
      );
      const p = await programmes.requireProgramme(id);
      await issueService(db).addComment(
        p.directionIssueId,
        `Decision request ${record.id}: ${request.question}\nRecommendation: ${request.recommendedOption}\nConsequence of waiting: ${request.consequencesOfWaiting}`,
        req.actor.type === "agent"
          ? { agentId: req.actor.agentId! }
          : { userId: req.actor.userId ?? "board" },
      );
      if (authority.queue !== "briefing")
        await wake(id, "validation_decision_requested");
      res.status(201).json(record);
    },
  );
  router.post(
    "/companies/:companyId/validation/decision-requests/:id/resolve",
    async (req, res) => {
      const id = await manager(req),
        answer = z
          .object({ answer: z.string().min(1).max(4000) })
          .strict()
          .parse(req.body);
      const [record] = await db
        .select()
        .from(validationRecords)
        .where(
          and(
            eq(validationRecords.companyId, id),
            eq(validationRecords.id, String(req.params.id)),
            eq(validationRecords.kind, "decision_request"),
          ),
        );
      if (!record) throw notFound("Decision request not found");
      if (record.payload.authority === "founder") assertBoard(req);
      await db
        .update(validationRecords)
        .set({
          status: "resolved",
          payload: {
            ...record.payload,
            answer: answer.answer,
            resolvedBy: actor(req),
          },
          updatedAt: new Date(),
        })
        .where(eq(validationRecords.id, record.id));
      const p = await programmes.requireProgramme(id);
      await issueService(db).addComment(
        p.directionIssueId,
        `Decision ${record.id}: ${answer.answer}`,
        req.actor.type === "agent"
          ? { agentId: req.actor.agentId! }
          : { userId: req.actor.userId ?? "board" },
      );
      await programmes.audit(id, actor(req), "decision.resolved", record.id);
      await wake(id, "validation_founder_reply");
      res.json({ status: "resolved" });
    },
  );
  router.put("/companies/:companyId/validation/nodepad", async (req, res) => {
    assertBoard(req);
    res.json(await nodepad.bind(company(req), req.body, actor(req)));
  });
  router.post(
    "/companies/:companyId/validation/nodepad/sync",
    async (req, res) => {
      const id = await manager(req),
        result = await nodepad.sync(id);
      if (result.status === "PASS_LIVE" || result.status === "PASS_LOCAL")
        await wake(id, "nodepad_material_state_synced");
      res.json(result);
    },
  );
  router.post(
    "/companies/:companyId/validation/nodepad/candidates",
    async (req, res) => {
      res.status(201).json(
        await nodepad.submit(company(req), actor(req), req.body, {
          founder: req.actor.type === "board",
        }),
      );
    },
  );
  router.post("/companies/:companyId/validation/handoff", async (req, res) => {
    res
      .status(201)
      .json(
        await programmes.handoff(
          await manager(req),
          req.body,
          key(req),
          actor(req),
        ),
      );
  });
  router.post(
    "/companies/:companyId/validation/actions/:id/reconcile",
    async (req, res) => {
      const id = await manager(req),
        actionsId = String(req.params.id);
      const [run] = await db
        .select()
        .from(githubActionRuns)
        .where(
          and(
            eq(githubActionRuns.id, actionsId),
            eq(githubActionRuns.companyId, id),
          ),
        );
      if (!run) throw notFound("Actions run not found");
      res.json(await githubActionsService(db).reconcile(actionsId));
    },
  );
  router.get(
    "/companies/:companyId/validation/actions/:id/artifacts/:artifactId",
    async (req, res) => {
      const id = company(req),
        artifactId = z.coerce
          .number()
          .int()
          .positive()
          .parse(req.params.artifactId);
      const data = await githubActionsService(db).retrieveArtifact(
        id,
        String(req.params.id),
        artifactId,
      );
      res.type("application/zip").send(Buffer.from(data));
    },
  );
  return router;
}
