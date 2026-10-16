import type {
  NodepadSnapshot,
  ValidationPolicy,
  ValidationTask,
} from "@paperclipai/shared";
export function evidenceGate(
  snapshot: NodepadSnapshot,
  gate: "problem" | "icp" | "commercial",
  policy: ValidationPolicy,
) {
  const accepted = snapshot.interviews.filter(
    (i) =>
      i.humanLed &&
      i.relevant &&
      i.analysisStatus === "accepted" &&
      i.pipelineRunRef &&
      i.sourceRef &&
      i.contentHash,
  );
  const count = new Set(accepted.map((i) => i.contentHash)).size;
  return {
    passed: count >= policy.interviewGates[gate],
    count,
    required: policy.interviewGates[gate],
    blocker:
      count >= policy.interviewGates[gate]
        ? null
        : "BLOCKED_ON_HUMAN_INTERVIEW",
  };
}
export function validationTaskGate(
  task: ValidationTask,
  snapshot: NodepadSnapshot | null,
  policy: ValidationPolicy,
) {
  if (task.workClass === "product_backend")
    return { allowed: false, blocker: "FOUNDER_ENGINEERING_DEPENDENCY" };
  if (!snapshot)
    return {
      allowed: false,
      blocker: "BLOCKED_ON_DIRECT_EVIDENCE",
      readiness: "READY_CONFIG",
    };
  for (const id of task.hypothesisIds) {
    const h = snapshot.hypotheses.find((item) => item.id === id);
    if (!h) return { allowed: false, blocker: "UNKNOWN_HYPOTHESIS" };
    const secondary = [
      "analysis",
      "synthesis",
      "report",
      "evidence_check",
    ].includes(task.workClass);
    if (
      h.blockedReason &&
      secondary &&
      !task.resolvesBlocker &&
      !task.differentDependency
    )
      return { allowed: false, blocker: h.blockedReason };
    const directRatio =
      h.directCount / Math.max(1, h.directCount + h.secondaryCount);
    if (
      secondary &&
      h.nextGate &&
      h.secondaryCount >= policy.saturation.minimumSecondary &&
      directRatio <= policy.saturation.maximumDirectRatio &&
      h.marginalValue <= policy.saturation.minimumMarginalValue &&
      !task.resolvesBlocker &&
      !task.differentDependency
    )
      return { allowed: false, blocker: "BLOCK_SECONDARY_RESEARCH" };
  }
  if (
    ["fake_door", "landing_page", "prototype", "frontend_experiment"].includes(
      task.workClass,
    )
  ) {
    // These are canonical Nodepad evidence refs/gaps, never a worker's claim of readiness.
    const required = [
      "target_customer",
      "problem",
      "customer_language",
      "proposition",
      "counter_hypothesis",
    ];
    const missing = required.filter(
      (key) => !snapshot.evidence.some((ref) => ref.startsWith(`${key}:`)),
    );
    if (
      !task.hypothesisIds.length ||
      missing.length ||
      !task.experimentQuestion ||
      !task.behavioralMetric ||
      !evidenceGate(snapshot, "problem", policy).passed
    )
      return { allowed: false, blocker: "FAKE_DOOR_NOT_READY", missing };
  }
  return { allowed: true, blocker: null };
}
