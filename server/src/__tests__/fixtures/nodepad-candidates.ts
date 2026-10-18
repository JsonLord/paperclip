import type { NodepadCandidate } from "@paperclipai/shared";
const base = {
  hypothesisId: "H-021",
  summary: "Traceable candidate, not canonical qualification",
};
const provenance = {
  sourceRef: "github:acme/research/interview.md",
  contentHash: "a".repeat(64),
  pipelineRunRef: "pipeline:accepted-analysis:1",
};
export const nodepadCandidates: NodepadCandidate[] = [
  {
    ...base,
    ...provenance,
    type: "evidence_submission",
    idempotencyKey: "evidence",
  },
  {
    ...base,
    type: "research_gap",
    idempotencyKey: "gap",
    question: "Who owns the buying decision?",
    sourceRefs: ["source:interview"],
  },
  {
    ...base,
    type: "hypothesis_proposal",
    idempotencyKey: "hypothesis",
    statement: "Buyers face a costly unresolved problem",
    sourceRefs: ["source:interview"],
  },
  {
    ...base,
    type: "counter_hypothesis",
    idempotencyKey: "counter",
    statement: "Existing workarounds may be sufficient",
    sourceRefs: ["source:contradiction"],
  },
  {
    ...base,
    type: "experiment_spec",
    idempotencyKey: "spec",
    question: "Will buyers request a conversation?",
    behavioralMetric: "Qualified requests / qualified visitors",
    stopCondition: "Stop at deadline or budget limit",
    sourceRefs: ["source:interview"],
  },
  {
    ...base,
    ...provenance,
    type: "experiment_result",
    idempotencyKey: "result",
    experimentId: "experiment:1",
  },
];
