import { z } from "zod";

export const VALIDATION_PHASES = [
  "EXPLORE",
  "CONCENTRATE",
  "REFINE",
  "FOUNDER_HANDOFF",
] as const;
export const VENTURE_DECISIONS = [
  "BUILD_RECOMMENDED",
  "MORE_VALIDATION_REQUIRED",
  "PIVOT_RECOMMENDED",
  "STOP_RECOMMENDED",
] as const;
export const VALIDATION_BLOCKERS = [
  "BLOCKED_ON_HUMAN_INTERVIEW",
  "BLOCKED_ON_CUSTOMER_INTERACTION",
  "BLOCKED_ON_DIRECT_EVIDENCE",
  "BLOCKED_ON_FOUNDER_DECISION",
  "BLOCKED_ON_EXTERNAL_SIMULATION",
  "BLOCKED_ON_COMMERCIAL_APPROVAL",
  "BLOCKED_ON_FAKE_DOOR_RESULT",
  "BLOCK_SECONDARY_RESEARCH",
  "FOUNDER_ENGINEERING_DEPENDENCY",
] as const;
export const ADAPTATION_ACTIONS = [
  "CONTINUE_PHASE",
  "EXIT_PHASE_EARLY",
  "EXTEND_PHASE",
  "COMPRESS_PHASE",
  "RETURN_TO_EARLIER_QUESTION",
  "PAUSE_PROGRAMME",
  "EARLY_DECISION_REVIEW",
  "ESCALATE_TO_FOUNDER",
] as const;
export const VALIDATION_WORK_CLASSES = [
  "analysis",
  "synthesis",
  "evidence_check",
  "report",
  "experiment_evaluation",
  "ethnography",
  "community_exploration",
  "customer_interaction",
  "frontend_experiment",
  "fake_door",
  "landing_page",
  "prototype",
  "visual",
  "deck",
  "demo",
  "campaign_asset",
  "product_backend",
  "lead_search",
  "outreach",
] as const;
export type ValidationPhase = (typeof VALIDATION_PHASES)[number];
const text = z.string().trim().min(1).max(4000);
const refs = z.array(z.string().min(1).max(500)).max(100).default([]);
export const validationPolicySchema = z
  .object({
    phaseDays: z
      .object({
        EXPLORE: z.number().positive(),
        CONCENTRATE: z.number().positive(),
        REFINE: z.number().positive(),
        FOUNDER_HANDOFF: z.number().nonnegative(),
      })
      .default({
        EXPLORE: 28,
        CONCENTRATE: 28,
        REFINE: 28,
        FOUNDER_HANDOFF: 0,
      }),
    autonomousTimingDays: z.number().min(0).max(2).default(2),
    maxActivePriority: z.number().int().positive().default(3),
    interviewGates: z
      .object({
        problem: z.number().int().min(3),
        icp: z.number().int().min(5),
        commercial: z.number().int().min(8),
      })
      .default({ problem: 3, icp: 5, commercial: 8 }),
    saturation: z
      .object({
        minimumSecondary: z.number().int().positive(),
        maximumDirectRatio: z.number().min(0).max(1),
        minimumMarginalValue: z.number().min(0).max(1),
      })
      .default({
        minimumSecondary: 12,
        maximumDirectRatio: 0.2,
        minimumMarginalValue: 0.1,
      }),
    weights: z.record(z.number().finite().min(0).max(100)).default({
      businessImpact: 3,
      uncertainty: 2,
      evidenceGap: 2,
      dependencyUnlock: 2,
      staleness: 1,
      directCustomerDeficit: 3,
      contradictionDeficit: 2,
      informationGain: 3,
      estimatedTime: 1,
      estimatedCost: 1,
      founderEffort: 1,
      julesRequirement: 1,
    }),
  })
  .strict();
export type ValidationPolicy = z.infer<typeof validationPolicySchema>;
export const startProgrammeSchema = z
  .object({
    ceoAgentId: z.string().uuid(),
    visionGoalId: z.string().uuid(),
    founderConstraints: refs,
    policy: validationPolicySchema.default({}),
  })
  .strict();
export const pauseProgrammeSchema = z.object({ reason: text }).strict();
export const adaptationSchema = z
  .object({
    action: z.enum(ADAPTATION_ACTIONS),
    phase: z.enum(VALIDATION_PHASES),
    activeDurationDays: z.number().nonnegative(),
    expectedDurationDays: z.number().nonnegative(),
    progress: text,
    reason: text,
    proposedChange: text,
    work: text,
    successCondition: text,
    stopCondition: text,
    deltaDays: z.number().finite().default(0),
    supportingRefs: refs,
  })
  .strict();
export type AdaptationProposal = z.infer<typeof adaptationSchema>;
export const decisionRequestSchema = z
  .object({
    question: text,
    requester: text,
    reason: text,
    options: z.array(text).min(2).max(8),
    recommendedOption: text,
    evidenceRefs: refs,
    hypothesisIds: refs,
    paperclipRefs: refs,
    consequencesOfWaiting: text,
    impact: z.enum(["low", "medium", "high"]),
    reversible: z.boolean(),
    deadline: z.string().datetime(),
    requiredAuthority: z.enum(["ceo", "founder"]),
    category: z.enum([
      "allocation",
      "sequence",
      "timing",
      "vision",
      "icp",
      "pivot",
      "pause",
      "budget",
      "market",
      "constraint",
      "positioning",
      "external_action",
    ]),
    confidence: z.number().min(0).max(1),
    conflictsWithFounder: z.boolean().default(false),
    evidenceAbsent: z.boolean().default(false),
    securityRisk: z.boolean().default(false),
    budgetBreach: z.boolean().default(false),
    criticallyBlocked: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => v.options.includes(v.recommendedOption),
    "Recommended option must be one of the options",
  );
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
export const decisionJournalSchema = z
  .object({
    decision: text,
    category: text,
    requester: text,
    hypothesisIds: refs,
    paperclipRefs: refs,
    nodepadRefs: refs,
    alternatives: z.array(text).max(8),
    rationale: text,
    authority: z.enum(["ceo", "founder"]),
    impact: z.enum(["low", "medium", "high"]),
    reversible: z.boolean(),
    expectedOutcome: text,
    expectedSignal: text,
    reviewDate: z.string().datetime(),
  })
  .strict();
export const founderStatementSchema = z
  .object({
    visionAnchor: text,
    interpretation: text,
    changed: refs,
    unchanged: refs,
    constraints: refs,
    priorityBets: refs,
    founderActions: refs,
    autonomousWork: refs,
    unresolvedQuestions: refs,
  })
  .strict();
export const managementCycleSchema = z
  .object({
    expectedProgress: text,
    actualProgress: text,
    materialChanges: refs,
    previousDecisionReview: text,
    highestImpactUncertainty: text,
    blockers: refs,
    agentResolvable: refs,
    founderActions: refs,
    stopWork: refs,
    mustWinOutcomes: z.array(text).max(3),
    founderQuestions: z.array(text).max(3),
    reporterAssessment: text,
  })
  .strict();
export const validationTaskSchema = z
  .object({
    workClass: z.enum(VALIDATION_WORK_CLASSES),
    hypothesisIds: refs,
    resolvesBlocker: z.boolean().default(false),
    differentDependency: text.optional(),
    externalApprovalId: z.string().uuid().optional(),
    experimentQuestion: text.optional(),
    behavioralMetric: text.optional(),
    writeScopes: refs,
  })
  .strict();
export type ValidationTask = z.infer<typeof validationTaskSchema>;
export const interviewSchema = z
  .object({
    id: text,
    sourceKind: z.enum([
      "transcript",
      "structured_notes",
      "recording_transcript",
    ]),
    sourceRef: text,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    humanLed: z.literal(true),
    relevant: z.boolean(),
    analysisStatus: z.enum(["pending", "accepted", "rejected"]),
    pipelineRunRef: text.nullable(),
    occurredAt: z.string().datetime(),
  })
  .strict();
export const nodepadHypothesisSchema = z
  .object({
    id: text,
    title: text,
    status: z.enum(["active", "merged", "archived", "disconfirmed"]),
    priority: z.boolean(),
    primary: z.boolean(),
    createdAt: z.string().datetime(),
    primarySince: z.string().datetime().nullable(),
    lastEvidenceAt: z.string().datetime().nullable(),
    lastMaterialAt: z.string().datetime().nullable(),
    nextGate: z.enum(["problem", "icp", "commercial"]).nullable(),
    blockedReason: z.enum(VALIDATION_BLOCKERS).nullable(),
    reviewDeadline: z.string().datetime().nullable(),
    qualification: z.string().nullable(),
    band: z.string().nullable(),
    factors: z.record(z.number().finite().min(0).max(1)),
    secondaryCount: z.number().int().nonnegative(),
    directCount: z.number().int().nonnegative(),
    marginalValue: z.number().min(0).max(1),
  })
  .strict();
export type NodepadHypothesis = z.infer<typeof nodepadHypothesisSchema>;
export const nodepadSnapshotSchema = z
  .object({
    companyId: z.string().uuid(),
    workspaceId: text,
    revision: text,
    capturedAt: z.string().datetime(),
    hypotheses: z.array(nodepadHypothesisSchema).max(1000),
    interviews: z.array(interviewSchema).max(10000),
    evidence: refs,
    contradictions: refs,
    researchGaps: refs,
    experiments: z
      .array(
        z.object({
          id: text,
          status: text,
          resultRef: text.nullable(),
          completedAt: z.string().datetime().nullable(),
        }),
      )
      .max(1000),
    materialChanges: refs,
    clocks: z.object({
      lastInterviewAt: z.string().datetime().nullable(),
      lastCustomerInteractionAt: z.string().datetime().nullable(),
      lastDirectEvidenceAt: z.string().datetime().nullable(),
      lastMaterialMovementAt: z.string().datetime().nullable(),
      lastExperimentAt: z.string().datetime().nullable(),
    }),
  })
  .strict();
export type NodepadSnapshot = z.infer<typeof nodepadSnapshotSchema>;
export const nodepadBindingSchema = z
  .object({
    baseUrl: z
      .string()
      .url()
      .refine(
        (v) =>
          new URL(v).protocol === "https:" &&
          !new URL(v).username &&
          !new URL(v).password &&
          !new URL(v).search &&
          !new URL(v).hash,
        "Nodepad requires HTTPS",
      ),
    workspaceId: text,
    apiKeySecretRef: z.string().uuid(),
  })
  .strict();
const nodepadCandidateBase = {
  idempotencyKey: z.string().min(1).max(200),
  hypothesisId: text,
  summary: text,
};
export const nodepadEvidenceSubmissionSchema = z
  .object({
    ...nodepadCandidateBase,
    type: z.literal("evidence_submission"),
    sourceRef: text,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    pipelineRunRef: text,
  })
  .strict();
export const nodepadResearchGapSchema = z
  .object({
    ...nodepadCandidateBase,
    type: z.literal("research_gap"),
    sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
    question: text,
  })
  .strict();
export const nodepadHypothesisProposalSchema = z
  .object({
    ...nodepadCandidateBase,
    type: z.literal("hypothesis_proposal"),
    sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
    statement: text,
  })
  .strict();
export const nodepadCounterHypothesisSchema = z
  .object({
    ...nodepadCandidateBase,
    type: z.literal("counter_hypothesis"),
    sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
    statement: text,
  })
  .strict();
export const nodepadExperimentSpecSchema = z
  .object({
    ...nodepadCandidateBase,
    type: z.literal("experiment_spec"),
    sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
    question: text,
    behavioralMetric: text,
    stopCondition: text,
  })
  .strict();
export const nodepadExperimentResultSchema = z
  .object({
    ...nodepadCandidateBase,
    type: z.literal("experiment_result"),
    experimentId: text,
    sourceRef: text,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    pipelineRunRef: text,
  })
  .strict();
/** No untagged compatibility fallback: evidence must never be interpreted as a hypothesis. */
export const nodepadCandidateSchema = z.discriminatedUnion("type", [
  nodepadEvidenceSubmissionSchema,
  nodepadResearchGapSchema,
  nodepadHypothesisProposalSchema,
  nodepadCounterHypothesisSchema,
  nodepadExperimentSpecSchema,
  nodepadExperimentResultSchema,
]);
export type NodepadCandidate = z.infer<typeof nodepadCandidateSchema>;
export type NodepadCandidateType = NodepadCandidate["type"];
export type NodepadCandidateOf<T extends NodepadCandidateType> = Extract<
  NodepadCandidate,
  { type: T }
>;
export const nodepadCandidateReceiptSchema = z
  .object({
    candidateId: text,
    companyId: z.string().uuid(),
    workspaceId: text,
  })
  .strict();
export type NodepadCandidateReceipt = z.infer<
  typeof nodepadCandidateReceiptSchema
>;
export const ventureHandoffSchema = z
  .object({
    kind: z.literal("PROJECT_CONTINUATION_RECOMMENDATION"),
    customerIcp: text,
    problemJtbd: text,
    customerLanguage: text,
    valueProposition: text,
    positioning: text,
    offer: text,
    pricingWtp: text,
    strongestEvidence: refs,
    contradictions: refs,
    channels: text,
    fakeDoorResults: text,
    campaignFindings: text,
    customerEvidence: refs,
    remainingRisks: refs,
    unjustifiedCapabilities: refs,
    mvpBoundary: text,
    founderEngineeringTests: refs,
    recommendation: z.enum(VENTURE_DECISIONS),
    nodepadRevision: text,
  })
  .strict();
export const VALIDATION_CAPABILITIES = {
  "validation.simulation.external": "INTEGRATION_PENDING",
  "validation.leads.search": "APPROVAL_REQUIRED",
  "validation.contact.outreach": "SEPARATE_APPROVAL_REQUIRED",
} as const;
