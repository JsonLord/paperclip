import { authorizeWorkforceNodepad } from "../workforce/guards.js";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import {
  nodepadBindings,
  validationRecords,
  activityLog,
  validationProgrammes,
  type Db,
} from "@paperclipai/db";
import {
  nodepadBindingSchema,
  nodepadCandidateSchema,
  nodepadSnapshotSchema,
  nodepadCandidateReceiptSchema,
  type NodepadCandidate,
  type NodepadCandidateOf,
  type NodepadCandidateReceipt,
  type NodepadSnapshot,
} from "@paperclipai/shared";
import { conflict, notFound, forbidden } from "../../errors.js";
import { secretService } from "../secrets.js";

export interface NodepadBinding {
  companyId: string;
  baseUrl: string;
  workspaceId: string;
  apiKeySecretRef: string;
}
export interface NodepadCandidateInput<
  T extends NodepadCandidate = NodepadCandidate,
> {
  actorId: string;
  companyId: string;
  workspaceId: string;
  candidate: T;
}
type CandidateOperation<T extends NodepadCandidate> = (
  binding: NodepadBinding,
  credential: string,
  input: NodepadCandidateInput<T>,
) => Promise<NodepadCandidateReceipt>;
export interface NodepadProvider {
  mode: "fixture" | "live";
  read(binding: NodepadBinding, credential: string): Promise<unknown>;
  submitEvidence: CandidateOperation<NodepadCandidateOf<"evidence_submission">>;
  proposeResearchGap: CandidateOperation<NodepadCandidateOf<"research_gap">>;
  proposeHypothesis: CandidateOperation<
    NodepadCandidateOf<"hypothesis_proposal">
  >;
  proposeCounterHypothesis: CandidateOperation<
    NodepadCandidateOf<"counter_hypothesis">
  >;
  proposeExperiment: CandidateOperation<NodepadCandidateOf<"experiment_spec">>;
  submitExperimentResult: CandidateOperation<
    NodepadCandidateOf<"experiment_result">
  >;
}
/** Exhaustive dispatch is shared by every caller. No generic provider write or evidence fallback. */
export function dispatchNodepadCandidate(
  provider: NodepadProvider,
  binding: NodepadBinding,
  credential: string,
  input: NodepadCandidateInput,
): Promise<NodepadCandidateReceipt> {
  const candidate = nodepadCandidateSchema.parse(input.candidate);
  switch (candidate.type) {
    case "evidence_submission":
      if (typeof provider.submitEvidence !== "function")
        throw conflict(
          "READY_CONFIG: Nodepad provider operation submitEvidence is unavailable",
        );
      return provider.submitEvidence(binding, credential, {
        ...input,
        candidate,
      });
    case "research_gap":
      if (typeof provider.proposeResearchGap !== "function")
        throw conflict(
          "READY_CONFIG: Nodepad provider operation proposeResearchGap is unavailable",
        );
      return provider.proposeResearchGap(binding, credential, {
        ...input,
        candidate,
      });
    case "hypothesis_proposal":
      if (typeof provider.proposeHypothesis !== "function")
        throw conflict(
          "READY_CONFIG: Nodepad provider operation proposeHypothesis is unavailable",
        );
      return provider.proposeHypothesis(binding, credential, {
        ...input,
        candidate,
      });
    case "counter_hypothesis":
      if (typeof provider.proposeCounterHypothesis !== "function")
        throw conflict(
          "READY_CONFIG: Nodepad provider operation proposeCounterHypothesis is unavailable",
        );
      return provider.proposeCounterHypothesis(binding, credential, {
        ...input,
        candidate,
      });
    case "experiment_spec":
      if (typeof provider.proposeExperiment !== "function")
        throw conflict(
          "READY_CONFIG: Nodepad provider operation proposeExperiment is unavailable",
        );
      return provider.proposeExperiment(binding, credential, {
        ...input,
        candidate,
      });
    case "experiment_result":
      if (typeof provider.submitExperimentResult !== "function")
        throw conflict(
          "READY_CONFIG: Nodepad provider operation submitExperimentResult is unavailable",
        );
      return provider.submitExperimentResult(binding, credential, {
        ...input,
        candidate,
      });
    default: {
      const exhaustive: never = candidate;
      throw new Error(`Unsupported Nodepad candidate: ${exhaustive}`);
    }
  }
}
/** Explicit bridge contract, not a claim about an undocumented vendor API. No qualification writes. */
export function nodepadHttpProvider(
  fetcher: typeof fetch = fetch,
): NodepadProvider {
  async function request(
    binding: NodepadBinding,
    key: string,
    suffix: string,
    init: RequestInit = {},
  ) {
    const url = new URL(binding.baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid Nodepad HTTPS binding");
    const response = await fetcher(
      `${binding.baseUrl.replace(/\/$/, "")}/workspaces/${encodeURIComponent(binding.workspaceId)}/${suffix}`,
      {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "x-paperclip-company-id": binding.companyId,
          ...init.headers,
        },
      },
    );
    if (!response.ok)
      throw new Error(`Nodepad bridge request failed (${response.status})`);
    return response.json();
  }
  async function postCandidate(
    b: NodepadBinding,
    key: string,
    path: string,
    expected: NodepadCandidate["type"],
    input: NodepadCandidateInput,
  ) {
    const candidate = nodepadCandidateSchema.parse(input.candidate);
    if (candidate.type !== expected)
      throw conflict(
        "Nodepad candidate type does not match provider operation",
      );
    if (input.companyId !== b.companyId || input.workspaceId !== b.workspaceId)
      throw forbidden("Nodepad input crossed company/workspace boundary");
    const receipt = nodepadCandidateReceiptSchema.parse(
      await request(b, key, path, {
        method: "POST",
        headers: {
          "idempotency-key": `${b.companyId}:${candidate.idempotencyKey}`,
        },
        body: JSON.stringify({
          actorId: input.actorId,
          companyId: input.companyId,
          workspaceId: input.workspaceId,
          candidate,
        }),
      }),
    );
    if (
      receipt.companyId !== b.companyId ||
      receipt.workspaceId !== b.workspaceId
    )
      throw conflict("Nodepad response crossed company/workspace boundary");
    return receipt;
  }
  return {
    mode: "live",
    read: async (b, key) => {
      const [context, brain] = await Promise.all([
        request(b, key, "context"),
        request(b, key, "brain"),
      ]);
      return {
        companyId: b.companyId,
        workspaceId: b.workspaceId,
        revision: String(context.revision),
        capturedAt: brain.manifest?.generatedAt || new Date().toISOString(),
        hypotheses: (brain.hypotheses || []).map((h: any) => ({
          id: h.id,
          title: h.title,
          statement: h.statement,
          status: h.status === "archived" ? "withdrawn" : "active",
          primary: false,
          confidence: h.confidence || 0,
          factors: {},
          secondaryCount: 0,
          directCount: 0,
          marginalValue: 0,
          reviewDeadline: null,
          qualification: h.qualification || null,
          band: null,
        })),
        interviews: [],
        evidence: [],
        contradictions: [],
        researchGaps: (brain.hypotheses || []).flatMap(
          (h: any) => h.researchGaps || [],
        ),
        materialChanges: [],
        clocks: {
          lastInterviewAt: null,
          lastCustomerInteractionAt: null,
          lastDirectEvidenceAt: null,
          lastMaterialMovementAt: null,
          lastExperimentAt: null,
        },
      };
    },
    // These are bridge contracts, not proof of vendor endpoint availability. HTTP errors fail closed.
    submitEvidence: (b, key, input) =>
      postCandidate(b, key, "evidence", "evidence_submission", input),
    proposeResearchGap: (b, key, input) =>
      postCandidate(b, key, "research-gaps", "research_gap", input),
    proposeHypothesis: (b, key, input) =>
      postCandidate(b, key, "hypotheses", "hypothesis_proposal", input),
    proposeCounterHypothesis: (b, key, input) =>
      postCandidate(b, key, "counter-hypotheses", "counter_hypothesis", input),
    proposeExperiment: (b, key, input) =>
      postCandidate(
        b,
        key,
        "experiments/specifications",
        "experiment_spec",
        input,
      ),
    submitExperimentResult: (b, key, input) =>
      postCandidate(b, key, "experiments/results", "experiment_result", input),
  };
}
export function assertNodepadScope(
  snapshot: NodepadSnapshot,
  binding: NodepadBinding,
) {
  if (
    snapshot.companyId !== binding.companyId ||
    snapshot.workspaceId !== binding.workspaceId
  )
    throw conflict("Nodepad response crossed company/workspace boundary");
}
export function nodepadService(
  db: Db,
  provider: NodepadProvider = nodepadHttpProvider(),
  resolveSecret = (companyId: string, ref: string) =>
    secretService(db).resolveSecretValue(companyId, ref, "latest"),
) {
  async function binding(companyId: string) {
    return db
      .select()
      .from(nodepadBindings)
      .where(eq(nodepadBindings.companyId, companyId))
      .then((r) => r[0] ?? null);
  }
  async function bind(
    companyId: string,
    value: unknown,
    actorId = "nodepad-binding",
  ) {
    const supplied = nodepadBindingSchema
      .partial({ baseUrl: true, workspaceId: true })
      .parse(value);
    const parsed = nodepadBindingSchema.parse({
      ...supplied,
      baseUrl: supplied.baseUrl ?? process.env.NODEPAD_BASE_URL,
      workspaceId: supplied.workspaceId ?? process.env.NODEPAD_WORKSPACE_ID,
    });
    parsed.baseUrl = new URL(parsed.baseUrl).toString().replace(/\/+$/, "");
    // Resolving by company proves that this secret is available to this company.
    await resolveSecret(companyId, parsed.apiKeySecretRef);
    const existing = await binding(companyId);
    if (
      existing &&
      existing.baseUrl === parsed.baseUrl &&
      existing.workspaceId === parsed.workspaceId &&
      existing.apiKeySecretRef === parsed.apiKeySecretRef
    )
      return {
        companyId,
        workspaceId: existing.workspaceId,
        baseUrl: existing.baseUrl,
        readiness: existing.snapshot ? "PASS_LOCAL" : "READY_CONFIG",
      };
    const saved = await db
      .insert(nodepadBindings)
      .values({ companyId, ...parsed })
      .onConflictDoUpdate({
        target: nodepadBindings.companyId,
        set: { ...parsed, snapshot: null, syncedAt: null },
      })
      .returning()
      .then((r) => ({
        companyId: r[0].companyId,
        workspaceId: r[0].workspaceId,
        baseUrl: r[0].baseUrl,
        readiness: "READY_CONFIG",
      }));
    await db.insert(activityLog).values({
      companyId,
      actorType: "system",
      actorId,
      action: "validation.nodepad.bound",
      entityType: "nodepad_binding",
      entityId: companyId,
      details: { workspaceId: parsed.workspaceId },
    });
    return saved;
  }
  async function sync(companyId: string) {
    const b = await binding(companyId);
    if (!b)
      return {
        status: "READY_CONFIG" as const,
        reason: "Company Nodepad binding is missing",
      };
    const snapshot = nodepadSnapshotSchema.parse(
      await provider.read(b, await resolveSecret(companyId, b.apiKeySecretRef)),
    );
    assertNodepadScope(snapshot, b);
    await db
      .update(nodepadBindings)
      .set({ snapshot, syncedAt: new Date() })
      .where(
        and(
          eq(nodepadBindings.companyId, companyId),
          eq(nodepadBindings.workspaceId, b.workspaceId),
          eq(nodepadBindings.baseUrl, b.baseUrl),
        ),
      );
    const candidates = await db
      .select()
      .from(validationRecords)
      .where(
        and(
          eq(validationRecords.companyId, companyId),
          eq(validationRecords.kind, "nodepad_candidate"),
        ),
      );
    for (const candidate of candidates) {
      const remote = candidate.payload.result as { candidateId?: string };
      if (
        (candidate.payload.candidate as { type?: string })?.type ===
          "evidence_submission" &&
        remote.candidateId &&
        snapshot.evidence.includes(remote.candidateId) &&
        candidate.status !== "accepted"
      )
        await db
          .update(validationRecords)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(validationRecords.id, candidate.id));
    }
    if (!b.snapshot || b.snapshot.revision !== snapshot.revision)
      await db
        .insert(validationRecords)
        .values({
          companyId,
          kind: "nodepad_projection",
          idempotencyKey: snapshot.revision,
          phase: "external",
          actorId: "nodepad",
          status: "projected",
          payload: {
            portfolio: snapshot.hypotheses.map((h) => ({
              id: h.id,
              status: h.status,
              primary: h.primary,
            })),
            revision: snapshot.revision,
            capturedAt: snapshot.capturedAt,
            active: snapshot.hypotheses
              .filter((h) => h.status === "active")
              .map((h) => h.id),
            primary: snapshot.hypotheses
              .filter((h) => h.primary)
              .map((h) => h.id),
            materialChanges: snapshot.materialChanges,
            previousGaps: b.snapshot?.researchGaps ?? [],
            gaps: snapshot.researchGaps,
          },
        })
        .onConflictDoNothing();
    return {
      status:
        provider.mode === "fixture"
          ? ("PASS_LOCAL" as const)
          : ("PASS_LIVE" as const),
      snapshot,
      previous: b.snapshot,
    };
  }
  async function submit(
    companyId: string,
    actorId: string,
    input: unknown,
    authority: { founder?: boolean } = {},
  ) {
    const candidate = nodepadCandidateSchema.parse(input);
    const specialist = await authorizeWorkforceNodepad(
      db,
      companyId,
      actorId,
      candidate.type,
      candidate.hypothesisId,
    );
    if (!specialist && !authority.founder) {
      const [programme] = await db
        .select()
        .from(validationProgrammes)
        .where(eq(validationProgrammes.companyId, companyId));
      if (programme?.ceoAgentId !== actorId)
        throw forbidden(
          "Nodepad candidate requires the company CEO, founder or an explicitly scoped specialist",
        );
    }
    const b = await binding(companyId);
    if (!b) throw notFound("Nodepad binding missing; READY_CONFIG");
    if (!b.snapshot?.hypotheses.some((h) => h.id === candidate.hypothesisId))
      throw conflict(
        "Candidate hypothesis is absent from the company's canonical projection",
      );
    // Provider must honor the idempotency key across interrupted responses and retries.
    const existing = await db
      .select()
      .from(validationRecords)
      .where(
        and(
          eq(validationRecords.companyId, companyId),
          eq(validationRecords.kind, "nodepad_candidate"),
          eq(validationRecords.idempotencyKey, candidate.idempotencyKey),
        ),
      )
      .then((r) => r[0]);
    if (existing) {
      if (!isDeepStrictEqual(existing.payload.candidate, candidate))
        throw conflict("Idempotency key reused with a different candidate");
      return existing;
    }
    const result = nodepadCandidateReceiptSchema.parse(
      await dispatchNodepadCandidate(
        provider,
        b,
        await resolveSecret(companyId, b.apiKeySecretRef),
        { actorId, companyId, workspaceId: b.workspaceId, candidate },
      ),
    );
    if (
      result.companyId !== companyId ||
      result.workspaceId !== b.workspaceId ||
      !result.candidateId
    )
      throw conflict(
        "Nodepad candidate response crossed company/workspace boundary",
      );
    const saved = await db
      .insert(validationRecords)
      .values({
        companyId,
        kind: "nodepad_candidate",
        idempotencyKey: candidate.idempotencyKey,
        phase: "external",
        actorId,
        status: "submitted",
        payload: { candidate, result },
      })
      .onConflictDoNothing()
      .returning()
      .then((r) => r[0] ?? result);
    await db.insert(activityLog).values({
      companyId,
      actorType: "system",
      actorId,
      action: "validation.nodepad.candidate_submitted",
      entityType: "validation_record",
      entityId: "id" in saved ? String(saved.id) : companyId,
      details: {
        workspaceId: b.workspaceId,
        candidateId: result.candidateId,
        candidateType: candidate.type,
        idempotencyKey: candidate.idempotencyKey,
      },
    });
    return saved;
  }
  return { bind, binding, sync, submit };
}
