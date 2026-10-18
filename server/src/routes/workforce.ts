import { workforceControlService } from "../services/workforce/control.js";
import { authorizeWorkforceNodepad } from "../services/workforce/guards.js";
import { workforceMetrics } from "../services/workforce/metrics.js";
import { validationProgrammeService } from "../services/validation/programmes.js";
/// <reference path="../types/express.d.ts" />
import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  nodepadBindings,
  workforceMembers,
  validationProgrammes,
  type Db,
} from "@paperclipai/db";
import { z } from "zod";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";
import { workforceImportService } from "../services/workforce/importer.js";
import { workforceService } from "../services/workforce/service.js";
import { heartbeatService } from "../services/heartbeat.js";
export function workforceRoutes(db: Db) {
  const router = Router(),
    imports = workforceImportService(db),
    service = workforceService(db, {
      wake: async (agentId, issueId, eventKey) =>
        heartbeatService(db).wakeup(agentId, {
          source: "automation",
          triggerDetail: "system",
          reason: "workforce_activation",
          idempotencyKey: `workforce:${eventKey}`,
          payload: { issueId, eventKey },
          contextSnapshot: { issueId, eventKey },
        }),
    });
  const company = (req: Request) => {
    const id = String(req.params.companyId);
    assertCompanyAccess(req, id);
    return id;
  };
  const actor = (req: Request) =>
    req.actor.type === "agent"
      ? req.actor.agentId!
      : (req.actor.userId ?? "board");
  async function manager(req: Request) {
    const id = company(req),
      [p] = await db
        .select()
        .from(validationProgrammes)
        .where(eq(validationProgrammes.companyId, id));
    if (
      !p ||
      (req.actor.type === "agent" && req.actor.agentId !== p.ceoAgentId)
    )
      throw forbidden("Founder or programme CEO required");
    return id;
  }
  const root = "/companies/:companyId/workforce";
  router.post(`${root}/activations/:id/stop`, async (req, res) => {
    const id = await manager(req),
      input = z
        .object({ reason: z.string().min(1).max(2000) })
        .strict()
        .parse(req.body);
    res.json(
      await workforceControlService(db, (agentId) =>
        heartbeatService(db).cancelActiveForAgent(agentId),
      ).stop(id, String(req.params.id), input.reason, actor(req)),
    );
  });
  router.get(`${root}/metrics`, async (req, res) =>
    res.json(await workforceMetrics(db, await manager(req))),
  );
  router.get(root, async (req, res) =>
    res.json(await service.inspect(await manager(req))),
  );
  router.post(`${root}/import`, async (req, res) => {
    assertBoard(req);
    res.json(await imports.importWorkforce(company(req), actor(req)));
  });
  router.put(`${root}/members/:id/override`, async (req, res) => {
    assertBoard(req);
    res.json(
      await imports.override(
        company(req),
        String(req.params.id),
        req.body,
        actor(req),
      ),
    );
  });
  router.post(`${root}/recommendations`, async (req, res) =>
    res.json(await service.recommend(await manager(req), req.body)),
  );
  router.post(`${root}/activate`, async (req, res) =>
    res.json(await service.activate(await manager(req), req.body, actor(req))),
  );
  router.post(`${root}/activations/:id/complete`, async (req, res) =>
    res.json(
      await service.complete(
        company(req),
        String(req.params.id),
        req.body,
        actor(req),
        req.actor.type === "board",
      ),
    ),
  );
  router.post(`${root}/proposals`, async (req, res) => {
    const id = company(req);
    if (req.actor.type !== "agent")
      throw forbidden("Activated specialist actor required");
    const proposal = z
      .object({
        operation: z.enum([
          "research_gap",
          "hypothesis_proposal",
          "counter_hypothesis",
          "experiment_spec",
          "experiment_result",
        ]),
        hypothesisId: z.string().min(1),
        sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(30),
        summary: z.string().min(1).max(4000),
        idempotencyKey: z.string().min(1).max(200),
      })
      .strict()
      .parse(req.body);
    await authorizeWorkforceNodepad(
      db,
      id,
      actor(req),
      proposal.operation,
      proposal.hypothesisId,
    );
    res
      .status(201)
      .json(
        await validationProgrammeService(db).record(
          id,
          "agency_candidate",
          proposal.idempotencyKey,
          actor(req),
          proposal,
          "pending_nodepad",
        ),
      );
  });
  router.get(`${root}/playbooks`, async (req, res) =>
    res.json(await service.playbooks(await manager(req))),
  );
  router.post(`${root}/playbooks/:workflowId/steps/:stepId`, async (req, res) =>
    res.json(
      await service.playbookStep(
        await manager(req),
        String(req.params.workflowId),
        String(req.params.stepId),
        req.body,
        actor(req),
      ),
    ),
  );
  router.get(`${root}/nodepad`, async (req, res) => {
    const id = company(req);
    if (req.actor.type !== "agent")
      throw forbidden("Scoped specialist actor required");
    const [m] = await db
      .select()
      .from(workforceMembers)
      .where(
        and(
          eq(workforceMembers.companyId, id),
          eq(workforceMembers.agentId, actor(req)),
        ),
      );
    if (
      !m ||
      !["ACTIVE", "WAITING"].includes(m.state) ||
      m.overrides.disabled ||
      m.overrides.paused ||
      m.drift === "upstream_removed"
    )
      throw forbidden("Specialist has no active Nodepad read grant");
    const scope = z
      .enum(["nodepad.context", "nodepad.hypotheses", "nodepad.evidence"])
      .parse(req.query.scope);
    await authorizeWorkforceNodepad(db, id, actor(req), scope);
    if (!m.definition.nodepad.reads.includes(scope))
      throw forbidden("Nodepad read scope not granted");
    const [b] = await db
        .select()
        .from(nodepadBindings)
        .where(eq(nodepadBindings.companyId, id)),
      s = b?.snapshot;
    // Project data only. The binding endpoint, URL and credential reference never cross into worker context.
    res.json(
      !s
        ? { status: "READY_CONFIG" }
        : scope === "nodepad.context"
          ? {
              revision: s.revision,
              researchGaps: s.researchGaps,
              contradictions: s.contradictions,
            }
          : scope === "nodepad.hypotheses"
            ? { revision: s.revision, hypotheses: s.hypotheses }
            : {
                revision: s.revision,
                evidence: s.evidence,
                interviews: s.interviews,
                experiments: s.experiments,
              },
    );
  });
  return router;
}
