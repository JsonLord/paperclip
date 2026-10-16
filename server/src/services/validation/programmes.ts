import { workforceImportService } from "../workforce/importer.js";
import { evidenceGate } from "./evidence-policy.js";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  activityLog,
  agents,
  approvals,
  companies,
  costEvents,
  goals,
  issues,
  issueComments,
  nodepadBindings,
  validationProgrammes,
  validationRecords,
  type Db,
} from "@paperclipai/db";
import {
  adaptationSchema,
  founderStatementSchema,
  managementCycleSchema,
  startProgrammeSchema,
  validationPolicySchema,
  ventureHandoffSchema,
  type ValidationPhase,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound } from "../../errors.js";
import { issueService } from "../issues.js";
import { documentService } from "../documents.js";
import {
  adaptationAuthority,
  nextPhase,
  programmeClock,
  programmeDiagnostics,
} from "./programme-policy.js";
import { nextBestValidationActions } from "./runtime.js";

export function validationProgrammeService(db: Db) {
  async function get(companyId: string) {
    return db
      .select()
      .from(validationProgrammes)
      .where(eq(validationProgrammes.companyId, companyId))
      .then((r) => r[0] ?? null);
  }
  async function requireProgramme(companyId: string) {
    const p = await get(companyId);
    if (!p) throw notFound("Validation programme not found");
    return p;
  }
  async function audit(
    companyId: string,
    actorId: string,
    action: string,
    entityId: string,
    details: Record<string, unknown> = {},
  ) {
    await db.insert(activityLog).values({
      companyId,
      actorType: "system",
      actorId,
      action: `validation.${action}`,
      entityType: "validation_programme",
      entityId,
      details,
    });
  }
  async function start(companyId: string, value: unknown, actorId: string) {
    const input = startProgrammeSchema.parse(value);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`validation:${companyId}`}))`,
      );
      const svc = validationProgrammeService(tx as unknown as Db);
      const existing = await svc.get(companyId);
      if (existing) return existing;
      const [ceo] = await tx
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.ceoAgentId),
            eq(agents.companyId, companyId),
            eq(agents.role, "ceo"),
          ),
        );
      const [vision] = await tx
        .select()
        .from(goals)
        .where(
          and(eq(goals.id, input.visionGoalId), eq(goals.companyId, companyId)),
        );
      if (!ceo || !vision || vision.parentId)
        throw conflict("Programme requires a company CEO and root Vision");
      const direction = await issueService(tx as unknown as Db).create(
        companyId,
        {
          title: "Founder Direction",
          description:
            "Persistent founder/CEO strategy thread. Founder statements are strategic authority, never customer evidence.",
          goalId: vision.id,
          status: "backlog",
          priority: "high",
        },
      );
      const [programme] = await tx
        .insert(validationProgrammes)
        .values({
          companyId,
          ceoAgentId: ceo.id,
          visionGoalId: vision.id,
          directionIssueId: direction.id,
          policy: input.policy,
          founderConstraints: input.founderConstraints,
        })
        .returning();
      await issueService(tx as unknown as Db).update(direction.id, {
        assigneeAgentId: ceo.id,
        status: "in_progress",
      });
      const heartbeat = (ceo.runtimeConfig.heartbeat ?? {}) as Record<
        string,
        unknown
      >;
      await tx
        .update(agents)
        .set({
          runtimeConfig: {
            ...ceo.runtimeConfig,
            heartbeat: { enabled: true, intervalSec: 86400, ...heartbeat },
          },
        })
        .where(eq(agents.id, ceo.id));
      await tx
        .update(companies)
        .set({ mode: "idea_validation", updatedAt: new Date() })
        .where(eq(companies.id, companyId));
      await workforceImportService(tx as unknown as Db).importWorkforce(
        companyId,
        actorId,
      );
      await svc.audit(companyId, actorId, "programme.started", programme.id);
      return programme;
    });
  }
  async function pause(
    companyId: string,
    reason: string | null,
    actorId: string,
    now = new Date(),
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`validation:${companyId}`}))`,
      );
      const svc = validationProgrammeService(tx as unknown as Db),
        p = await svc.requireProgramme(companyId);
      const pauses = [...p.pauses];
      if (reason && !p.pausedAt)
        pauses.push({ start: now.toISOString(), end: null, reason });
      if (!reason && p.pausedAt) {
        const open = pauses.findLast((i) => !i.end);
        if (open) open.end = now.toISOString();
      }
      if (Boolean(reason) === Boolean(p.pausedAt)) return p;
      const [row] = await tx
        .update(validationProgrammes)
        .set({
          pausedAt: reason ? now : null,
          pauseReason: reason,
          pauses,
          updatedAt: now,
        })
        .where(eq(validationProgrammes.companyId, companyId))
        .returning();
      await svc.audit(
        companyId,
        actorId,
        reason ? "programme.paused" : "programme.resumed",
        p.id,
        { reason },
      );
      return row;
    });
  }
  async function record(
    companyId: string,
    kind: string,
    idempotencyKey: string,
    actorId: string,
    payload: Record<string, unknown>,
    status = "recorded",
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`validation-record:${companyId}:${kind}:${idempotencyKey}`}))`,
      );
      const svc = validationProgrammeService(tx as unknown as Db);
      const p = await svc.requireProgramme(companyId);
      const previous = await tx
        .select()
        .from(validationRecords)
        .where(
          and(
            eq(validationRecords.companyId, companyId),
            eq(validationRecords.kind, kind),
            eq(validationRecords.idempotencyKey, idempotencyKey),
          ),
        )
        .then((r) => r[0]);
      if (previous) {
        if (!isDeepStrictEqual(previous.payload, payload))
          throw conflict("Idempotency key reused with different data");
        return previous;
      }
      const [row] = await tx
        .insert(validationRecords)
        .values({
          companyId,
          kind,
          idempotencyKey,
          actorId,
          payload,
          status,
          phase: p.phase,
        })
        .returning();
      await svc.audit(companyId, actorId, kind, row.id);
      return row;
    });
  }

  async function propose(
    companyId: string,
    value: unknown,
    key: string,
    actorId: string,
  ) {
    const proposal = adaptationSchema.parse(value),
      p = await requireProgramme(companyId);
    if (p.phase !== proposal.phase)
      throw conflict("Adaptation proposal phase is stale");
    const clock = programmeClock(
      p.startedAt,
      p.phaseStartedAt,
      p.pauses,
      new Date(),
    );
    const authority =
      Math.abs((p.phaseAdjustments[p.phase] ?? 0) + proposal.deltaDays) >
      p.policy.autonomousTimingDays
        ? "founder"
        : adaptationAuthority(proposal, p.policy);
    return record(
      companyId,
      "adaptation",
      key,
      actorId,
      {
        ...proposal,
        activeDurationDays: clock.phaseActiveDays,
        expectedDurationDays: p.policy.phaseDays[p.phase as ValidationPhase],
        founderApprovalRequired: authority === "founder",
      },
      authority === "ceo" ? "ceo_pending" : "founder_pending",
    );
  }
  async function applyProposal(
    companyId: string,
    id: string,
    actorId: string,
    founder: boolean,
    now = new Date(),
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`validation:${companyId}`}))`,
      );
      const svc = validationProgrammeService(tx as unknown as Db),
        p = await svc.requireProgramme(companyId);
      const [r] = await tx
        .select()
        .from(validationRecords)
        .where(
          and(
            eq(validationRecords.id, id),
            eq(validationRecords.companyId, companyId),
            eq(validationRecords.kind, "adaptation"),
          ),
        );
      if (!r) throw notFound("Adaptation not found");
      if (r.status === "applied") return r;
      if (r.phase !== p.phase)
        throw conflict("Adaptation proposal phase is stale");
      if (r.payload.founderApprovalRequired && !founder)
        throw forbidden("Founder approval required");
      const action = r.payload.action;
      if (action === "PAUSE_PROGRAMME")
        await svc.pause(companyId, String(r.payload.reason), actorId, now);
      else if (action === "EXIT_PHASE_EARLY") {
        if (p.pausedAt)
          throw conflict("Resume programme before transitioning phase");
        await tx
          .update(validationProgrammes)
          .set({
            phase: nextPhase(p.phase as ValidationPhase),
            phaseStartedAt: now,
            updatedAt: now,
          })
          .where(eq(validationProgrammes.id, p.id));
      } else if (["EXTEND_PHASE", "COMPRESS_PHASE"].includes(String(action))) {
        const change = Number(r.payload.deltaDays);
        if (
          (action === "EXTEND_PHASE" && change <= 0) ||
          (action === "COMPRESS_PHASE" && change >= 0)
        )
          throw conflict("Timing delta does not match adaptation action");
        if (
          p.policy.phaseDays[p.phase as ValidationPhase] +
            (p.phaseAdjustments[p.phase] ?? 0) +
            change <=
          0
        )
          throw conflict("Phase duration must remain positive");
        await tx
          .update(validationProgrammes)
          .set({
            phaseAdjustments: {
              ...p.phaseAdjustments,
              [p.phase]: (p.phaseAdjustments[p.phase] ?? 0) + change,
            },
            updatedAt: now,
          })
          .where(eq(validationProgrammes.id, p.id));
      }
      await svc.audit(companyId, actorId, "adaptation.applied", r.id, {
        action,
      });
      return tx
        .update(validationRecords)
        .set({ status: "applied", updatedAt: now })
        .where(eq(validationRecords.id, id))
        .returning()
        .then((rows) => rows[0]);
    });
  }
  async function summary(companyId: string, now = new Date()) {
    const p = await requireProgramme(companyId),
      [binding] = await db
        .select()
        .from(nodepadBindings)
        .where(eq(nodepadBindings.companyId, companyId));
    const snapshot = binding?.snapshot ?? null,
      clock = programmeClock(p.startedAt, p.phaseStartedAt, p.pauses, now);
    const recent = await db
      .select()
      .from(validationRecords)
      .where(eq(validationRecords.companyId, companyId))
      .orderBy(desc(validationRecords.createdAt))
      .limit(40);
    const effectivePolicy = {
      ...p.policy,
      phaseDays: {
        ...p.policy.phaseDays,
        [p.phase]:
          p.policy.phaseDays[p.phase as ValidationPhase] +
          (p.phaseAdjustments[p.phase] ?? 0),
      },
    };
    const trajectory = await db
      .select()
      .from(validationRecords)
      .where(
        and(
          eq(validationRecords.companyId, companyId),
          eq(validationRecords.kind, "nodepad_projection"),
        ),
      )
      .orderBy(desc(validationRecords.createdAt))
      .limit(20);
    const previousPortfolio = trajectory[1]?.payload.portfolio as
      | Array<{
          id: string;
          status: "active" | "merged" | "archived" | "disconfirmed";
          primary: boolean;
        }>
      | undefined;
    const diagnostics = snapshot
      ? programmeDiagnostics(
          snapshot,
          p.phase as ValidationPhase,
          clock.phaseActiveDays,
          effectivePolicy,
          now,
          previousPortfolio ? { hypotheses: previousPortfolio } : null,
        )
      : null;
    return {
      programme: p,
      clock,
      phaseTargetDays: effectivePolicy.phaseDays[p.phase as ValidationPhase],
      diagnostics,
      hypothesisTrajectory: trajectory.map((r) => ({
        revision: r.payload.revision,
        capturedAt: r.payload.capturedAt,
        active: r.payload.active,
        primary: r.payload.primary,
        materialChanges: r.payload.materialChanges,
      })),
      evidenceGates: snapshot
        ? {
            problem: evidenceGate(snapshot, "problem", p.policy),
            icp: evidenceGate(snapshot, "icp", p.policy),
            commercial: evidenceGate(snapshot, "commercial", p.policy),
          }
        : null,
      nextActions: snapshot
        ? nextBestValidationActions(snapshot, p.policy).slice(0, 10)
        : [],
      nodepad: {
        status: snapshot ? "PASS_LOCAL" : "READY_CONFIG",
        revision: snapshot?.revision ?? null,
        syncedAt: binding?.syncedAt ?? null,
        clocks: snapshot?.clocks ?? null,
      },
      founderQueue: recent.filter(
        (r) =>
          ["decision_request", "engineering_dependency"].includes(r.kind) &&
          r.status !== "resolved",
      ),
      decisions: recent.filter((r) => r.kind === "decision"),
      agencyCandidates: recent
        .filter((r) => r.kind === "agency_candidate")
        .slice(0, 10),
      latestReporter: recent.find((r) => r.kind === "reporter") ?? null,
      latestCycle: recent.find((r) => r.kind === "management_cycle") ?? null,
      adaptations: recent.filter((r) => r.kind === "adaptation"),
    };
  }
  async function statement(
    companyId: string,
    input: unknown,
    actor: { userId?: string; agentId?: string },
  ) {
    const p = await requireProgramme(companyId),
      parsed = founderStatementSchema.parse(input);
    if (!actor.userId && actor.agentId !== p.ceoAgentId)
      throw forbidden("Founder or programme CEO required");
    // CEO interpretations cannot amend founder constraints; board-only approval remains authoritative.
    if (
      !actor.userId &&
      JSON.stringify(parsed.constraints) !==
        JSON.stringify(p.founderConstraints)
    )
      throw forbidden("Founder constraints require founder approval");
    const current = await documentService(db).getIssueDocumentByKey(
      p.directionIssueId,
      "founder-statement",
    );
    const result = await documentService(db).upsertIssueDocument({
      baseRevisionId: current?.latestRevisionId,
      issueId: p.directionIssueId,
      key: "founder-statement",
      title: "Founder Statement",
      format: "markdown",
      body: JSON.stringify(parsed, null, 2),
      createdByAgentId: actor.agentId,
      createdByUserId: actor.userId,
    });
    if (actor.userId)
      await db
        .update(validationProgrammes)
        .set({ founderConstraints: parsed.constraints })
        .where(eq(validationProgrammes.companyId, companyId));
    await audit(
      companyId,
      actor.userId ?? actor.agentId ?? "system",
      "founder_statement.updated",
      p.id,
      { revisionId: result.document.latestRevisionId },
    );
    return result;
  }
  async function cycle(
    companyId: string,
    value: unknown,
    key: string,
    actorId: string,
  ) {
    return record(
      companyId,
      "management_cycle",
      key,
      actorId,
      managementCycleSchema.parse(value),
    );
  }
  async function handoff(
    companyId: string,
    value: unknown,
    key: string,
    actorId: string,
  ) {
    const handoff = ventureHandoffSchema.parse(value),
      [b] = await db
        .select()
        .from(nodepadBindings)
        .where(eq(nodepadBindings.companyId, companyId));
    if (!b?.snapshot || b.snapshot.revision !== handoff.nodepadRevision)
      throw conflict("Handoff requires current Nodepad revision");
    return record(
      companyId,
      "handoff",
      key,
      actorId,
      handoff,
      "founder_pending",
    );
  }
  return {
    get,
    requireProgramme,
    start,
    pause,
    record,
    audit,
    propose,
    applyProposal,
    summary,
    statement,
    cycle,
    handoff,
  };
}
