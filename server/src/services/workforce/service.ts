import { and, eq, desc, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { z } from "zod";
import {
  agentWakeupRequests,
  workforceImports,
  workforceMembers,
  workforceActivations,
  validationProgrammes,
  nodepadBindings,
  approvals,
  issueWorkProducts,
  activityLog,
  validationRecords,
  type Db,
} from "@paperclipai/db";
import {
  VENTURE_DECISIONS,
  workforceNeedSchema,
  type WorkforceNeed,
  type ValidationPhase,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound } from "../../errors.js";
import { issueService } from "../issues.js";
import { routeWorkforceNeed } from "./routing.js";
import { actionsConfigSchema } from "../validation/github-actions.js";

export const workforceResultSchema = z
  .object({
    ventureDecision: z.enum(VENTURE_DECISIONS).optional(),
    report: z.string().min(1).max(16000),
    artifactIds: z.array(z.string().uuid()).max(30),
    nodepadRefs: z.array(z.string().min(1).max(500)).max(30),
    outcome: z.enum([
      "evidence_submitted",
      "research_gap_identified",
      "experiment_completed",
      "decision_enabled",
      "reusable_artifact",
      "no_material_result",
      "blocked",
    ]),
  })
  .strict();
export async function hermesAvailable() {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    try {
      await access(join(directory, "hermes"), constants.X_OK);
      return true;
    } catch {
      /* inspect next configured executable directory */
    }
  }
  return false;
}
export function workforceService(
  db: Db,
  options: {
    runtimes?: Record<string, boolean>;
    wake?: (
      agentId: string,
      issueId: string,
      eventKey: string,
    ) => Promise<unknown>;
  } = {},
) {
  async function context(companyId: string, need: WorkforceNeed) {
    const [programme] = await db
      .select()
      .from(validationProgrammes)
      .where(eq(validationProgrammes.companyId, companyId));
    const [imported] = await db
      .select()
      .from(workforceImports)
      .where(eq(workforceImports.companyId, companyId));
    if (!programme || !imported)
      throw conflict("Import a workforce into this validation company first");
    const [binding] = await db
      .select()
      .from(nodepadBindings)
      .where(eq(nodepadBindings.companyId, companyId));
    const members = await db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.companyId, companyId));
    const history = await db
      .select()
      .from(workforceActivations)
      .where(eq(workforceActivations.companyId, companyId));
    const active = history.filter(
      (a) =>
        ["ACTIVE", "AWAITING_RESULT", "BLOCKED", "STOP_REQUESTED"].includes(
          a.status,
        ) && !a.result,
    );
    const blockedMembers = new Set(
      active.filter((a) => a.status !== "ACTIVE").map((a) => a.memberId),
    );
    const routingMembers = members.map((m) =>
      blockedMembers.has(m.id) ? { ...m, state: "WAITING" } : m,
    );
    const [approval] = need.validationTask.externalApprovalId
      ? await db
          .select()
          .from(approvals)
          .where(
            and(
              eq(approvals.companyId, companyId),
              eq(approvals.id, need.validationTask.externalApprovalId),
              eq(approvals.status, "approved"),
            ),
          )
      : [];
    // Approval must identify this exact event, hypothesis and action; a general company approval is insufficient.
    const approved =
      approval?.payload?.eventKey === need.eventKey &&
      approval.payload.hypothesisId === need.hypothesisId &&
      approval.payload.action === need.validationTask.workClass;
    const actions = actionsConfigSchema.safeParse(
      programme.runtimeBindings["github-actions"],
    );
    const runtimes = options.runtimes ?? {
      "github-actions":
        actions.success && Boolean(actions.data.workforcePacketInput),
      hermes_local: await hermesAvailable(),
      jules: Boolean(programme.runtimeBindings.jules),
    };
    return {
      programme,
      imported,
      context: {
        phase: programme.phase as ValidationPhase,
        policy: programme.policy,
        snapshot: binding?.snapshot ?? null,
        members: routingMembers,
        runtimes,
        approved,
        activeHypothesisIds: active
          .filter((a) => a.need.eventType !== "reporting_tick")
          .map((a) => a.need.hypothesisId),
        paused: Boolean(programme.pausedAt),
      },
    };
  }
  async function recommend(companyId: string, input: unknown) {
    const need = workforceNeedSchema.parse(input),
      c = await context(companyId, need);
    return routeWorkforceNeed(c.imported.definition, need, c.context);
  }
  async function activate(companyId: string, input: unknown, actorId: string) {
    const need = workforceNeedSchema.parse(input);
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`workforce:${companyId}`}))`,
      );
      const [previous] = await tx
        .select()
        .from(workforceActivations)
        .where(
          and(
            eq(workforceActivations.companyId, companyId),
            eq(workforceActivations.eventKey, need.eventKey),
          ),
        );
      if (previous) {
        if (!isDeepStrictEqual(previous.need, need))
          throw conflict("Activation event key reused with different intent");
        return { status: "REUSED", activation: previous };
      }
      const c = await workforceService(tx as unknown as Db, options)._context(
          companyId,
          need,
        ),
        route = routeWorkforceNeed(c.imported.definition, need, c.context);
      if (route.status !== "READY") return route;
      const selected = route.recommendations[0];
      const issue = await issueService(tx as unknown as Db).create(companyId, {
        title: `${selected.agencyId}: ${need.gap}`,
        description: selected.reason,
        goalId: c.programme.visionGoalId,
        status: "todo",
        priority: "high",
        validationTask: need.validationTask,
      });
      const [activation] = await tx
        .insert(workforceActivations)
        .values({
          companyId,
          memberId: selected.memberId,
          eventKey: need.eventKey,
          issueId: issue.id,
          need,
          runtime: selected.runtime,
          phase: c.programme.phase,
          requestedBy: actorId,
          sourceCommit: c.imported.sourceCommit,
        })
        .returning();
      await tx
        .update(workforceMembers)
        .set({ state: "ACTIVE", updatedAt: new Date() })
        .where(eq(workforceMembers.id, selected.memberId));
      await issueService(tx as unknown as Db).update(issue.id, {
        assigneeAgentId: selected.agentId,
        status: "in_progress",
      });
      await tx.insert(activityLog).values({
        companyId,
        actorType: "system",
        actorId,
        action: "workforce.activated",
        entityType: "workforce_activation",
        entityId: activation.id,
        details: {
          ...selected,
          hypothesisId: need.hypothesisId,
          eventKey: need.eventKey,
          economics: need.economics,
        },
      });
      return { status: "ACTIVATED", activation, agentId: selected.agentId };
    });
    if (
      "activation" in result &&
      result.activation.status === "ACTIVE" &&
      result.activation.issueId &&
      options.wake
    ) {
      const activation = result.activation;
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`workforce-wake:${activation.id}`}))`,
        );
        const [current] = await tx
          .select()
          .from(workforceActivations)
          .where(eq(workforceActivations.id, activation.id));
        if (current.wakeupAt || current.status !== "ACTIVE") return;
        const [member] = await tx
          .select()
          .from(workforceMembers)
          .where(eq(workforceMembers.id, current.memberId));
        const requests = await tx
          .select()
          .from(agentWakeupRequests)
          .where(
            and(
              eq(agentWakeupRequests.companyId, companyId),
              eq(agentWakeupRequests.agentId, member.agentId),
              eq(
                agentWakeupRequests.idempotencyKey,
                `workforce:${need.eventKey}`,
              ),
            ),
          );
        if (!requests.some((r) => r.runId))
          await options.wake!(member.agentId, current.issueId!, need.eventKey);
        await tx
          .update(workforceActivations)
          .set({ wakeupAt: new Date() })
          .where(eq(workforceActivations.id, current.id));
      });
    }
    return result;
  }
  async function complete(
    companyId: string,
    id: string,
    input: unknown,
    actorId: string,
    founder = false,
  ) {
    const result = workforceResultSchema.parse(input);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`workforce:${companyId}`}))`,
      );
      const [a] = await tx
        .select()
        .from(workforceActivations)
        .where(
          and(
            eq(workforceActivations.companyId, companyId),
            eq(workforceActivations.id, id),
          ),
        );
      if (!a) throw notFound("Workforce activation not found");
      const [m] = await tx
        .select()
        .from(workforceMembers)
        .where(eq(workforceMembers.id, a.memberId));
      if (!founder && actorId !== m.agentId)
        throw forbidden(
          "Only the assigned specialist or founder may submit its immutable report",
        );
      if (
        m.agencyId === "venture-judge" &&
        result.outcome !== "blocked" &&
        !result.ventureDecision
      )
        throw conflict(
          "Venture Judge must select an explicit validation conclusion",
        );
      if (result.ventureDecision && m.agencyId !== "venture-judge")
        throw forbidden(
          "Only independent Venture Judge findings carry this recommendation",
        );
      if (a.result) {
        if (!isDeepStrictEqual(a.result, result))
          throw conflict(
            "Specialist findings are immutable; submit an independent review instead",
          );
        return a;
      }
      if (!["ACTIVE", "AWAITING_RESULT", "BLOCKED"].includes(a.status))
        throw conflict(
          "Stopped or cancelled activation cannot receive a new finding",
        );
      const pending = await tx
        .select()
        .from(workforceActivations)
        .where(
          and(
            eq(workforceActivations.companyId, companyId),
            eq(workforceActivations.memberId, m.id),
          ),
        );
      if (
        pending.some(
          (other) =>
            other.id !== a.id &&
            ["ACTIVE", "AWAITING_RESULT"].includes(other.status),
        )
      )
        throw conflict("A newer specialist activation owns this logical agent");
      const products = await tx
        .select()
        .from(issueWorkProducts)
        .where(
          and(
            eq(issueWorkProducts.companyId, companyId),
            eq(issueWorkProducts.issueId, a.issueId!),
          ),
        );
      if (result.artifactIds.some((id) => !products.some((p) => p.id === id)))
        throw conflict(
          "Result artifact must be registered on this company task",
        );
      const [b] = await tx
        .select()
        .from(nodepadBindings)
        .where(eq(nodepadBindings.companyId, companyId));
      const refs = new Set([
        ...(b?.snapshot?.evidence ?? []),
        ...(b?.snapshot?.researchGaps ?? []),
        ...(b?.snapshot?.experiments.map((e) => e.id) ?? []),
      ]);
      if (result.nodepadRefs.some((ref) => !refs.has(ref)))
        throw conflict(
          "Result reference must exist in canonical company Nodepad",
        );
      if (
        !["no_material_result", "blocked"].includes(result.outcome) &&
        !result.artifactIds.length &&
        !result.nodepadRefs.length
      )
        throw conflict(
          "Material outcomes require a registered artifact or canonical Nodepad reference",
        );
      const blocked = result.outcome === "blocked";
      const [row] = await tx
        .update(workforceActivations)
        .set({
          result,
          status: blocked ? "BLOCKED" : "DONE",
          finishedAt: new Date(),
        })
        .where(eq(workforceActivations.id, id))
        .returning();
      await tx
        .update(workforceMembers)
        .set({
          state: blocked ? "BLOCKED" : m.definition.activation.defaultState,
          updatedAt: new Date(),
        })
        .where(eq(workforceMembers.id, m.id));
      await issueService(tx as unknown as Db).update(a.issueId!, {
        status: blocked ? "blocked" : "done",
        assigneeAgentId: null,
      });
      if (m.agencyId === "founder-intelligence-reporter") {
        await tx
          .insert(validationRecords)
          .values({
            companyId,
            kind: "reporter",
            idempotencyKey: `agency:${a.id}`,
            actorId,
            phase: a.phase,
            status: "recorded",
            payload: {
              assessment: result.report,
              warnings: [],
              sourceRefs: [...result.artifactIds, ...result.nodepadRefs],
              activationId: a.id,
              independent: true,
            },
          })
          .onConflictDoNothing();
      }
      await tx.insert(activityLog).values({
        companyId,
        actorType: founder ? "user" : "agent",
        actorId,
        action: "workforce.completed",
        entityType: "workforce_activation",
        entityId: id,
        details: {
          outcome: result.outcome,
          artifactIds: result.artifactIds,
          nodepadRefs: result.nodepadRefs,
        },
      });
      return row;
    });
  }
  async function inspect(companyId: string) {
    return {
      members: await db
        .select()
        .from(workforceMembers)
        .where(eq(workforceMembers.companyId, companyId)),
      activations: await db
        .select()
        .from(workforceActivations)
        .where(eq(workforceActivations.companyId, companyId))
        .orderBy(desc(workforceActivations.createdAt))
        .limit(50),
    };
  }
  async function playbooks(companyId: string) {
    const [i] = await db
      .select()
      .from(workforceImports)
      .where(eq(workforceImports.companyId, companyId));
    return i?.definition.workflows ?? [];
  }
  async function playbookStep(
    companyId: string,
    workflowId: string,
    stepId: string,
    input: unknown,
    actorId: string,
  ) {
    const workflow = (await playbooks(companyId)).find(
        (w) => w.id === workflowId,
      ),
      step = workflow?.steps.find((s) => s.id === stepId);
    if (!step) throw notFound("Agency playbook step not found");
    // A playbook suggests methodology; each step must independently satisfy current canonical gaps and all activation gates.
    const need = workforceNeedSchema.parse(input);
    if (need.agencyId && need.agencyId !== step.agencyId)
      throw conflict("Step specialist mismatch");
    return activate(companyId, { ...need, agencyId: step.agencyId }, actorId);
  }
  return {
    recommend,
    activate,
    complete,
    inspect,
    playbooks,
    playbookStep,
    _context: context,
  };
}
