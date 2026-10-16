import {
  nodepadSnapshotSchema,
  type NodepadSnapshot,
} from "@paperclipai/shared";
export const COMPANY_ID = "10000000-0000-4000-8000-000000000001";
export const NOW = new Date("2026-10-16T12:00:00Z");
export function snapshot(companyId = COMPANY_ID): NodepadSnapshot {
  return nodepadSnapshotSchema.parse({
    companyId,
    workspaceId: "workspace-a",
    revision: "r1",
    capturedAt: NOW.toISOString(),
    hypotheses: [
      {
        id: "H-021",
        title: "Customers need this outcome",
        status: "active",
        priority: true,
        primary: true,
        createdAt: "2026-09-01T00:00:00Z",
        primarySince: "2026-09-01T00:00:00Z",
        lastEvidenceAt: null,
        lastMaterialAt: null,
        nextGate: "problem",
        blockedReason: "BLOCKED_ON_HUMAN_INTERVIEW",
        reviewDeadline: "2026-10-10T00:00:00Z",
        qualification: "unqualified",
        band: "exploratory",
        factors: {
          businessImpact: 1,
          uncertainty: 1,
          evidenceGap: 1,
          informationGain: 1,
          estimatedTime: 0.1,
        },
        secondaryCount: 15,
        directCount: 0,
        marginalValue: 0.01,
      },
    ],
    interviews: [],
    evidence: [],
    contradictions: ["counter-hypothesis:no urgent pain"],
    researchGaps: ["customer_language", "proposition"],
    experiments: [],
    materialChanges: [],
    clocks: {
      lastInterviewAt: null,
      lastCustomerInteractionAt: null,
      lastDirectEvidenceAt: null,
      lastMaterialMovementAt: null,
      lastExperimentAt: null,
    },
  });
}
export function interview(index: number, analyzed = true) {
  return {
    id: `interview-${index}`,
    sourceKind: "transcript" as const,
    sourceRef: `github:acme/validation/interviews/${index}.md`,
    contentHash: String(index).padStart(64, "0"),
    humanLed: true as const,
    relevant: true,
    analysisStatus: analyzed ? ("accepted" as const) : ("pending" as const),
    pipelineRunRef: analyzed ? `github-actions:${index}` : null,
    occurredAt: NOW.toISOString(),
  };
}
export const adaptation = {
  action: "EXTEND_PHASE" as const,
  phase: "EXPLORE" as const,
  activeDurationDays: 1,
  expectedDurationDays: 28,
  progress: "Interview pipeline started",
  reason: "Customer availability",
  proposedChange: "Two extra active days",
  work: "Complete interviews",
  successCondition: "Three analyzed interviews",
  stopCondition: "Founder review if no interview occurs",
  deltaDays: 2,
  supportingRefs: ["H-021"],
};
export const decision = {
  question: "Which test variant should run?",
  requester: "ceo",
  reason: "Choose the cheapest informative variant",
  options: ["A", "B"],
  recommendedOption: "A",
  evidenceRefs: ["E-1"],
  hypothesisIds: ["H-021"],
  paperclipRefs: [],
  consequencesOfWaiting: "Loses a validation day",
  impact: "low" as const,
  reversible: true,
  deadline: "2026-10-20T12:00:00Z",
  requiredAuthority: "ceo" as const,
  category: "sequence" as const,
  confidence: 0.9,
  conflictsWithFounder: false,
  evidenceAbsent: false,
  securityRisk: false,
  budgetBreach: false,
  criticallyBlocked: false,
};
