import type {
  NodepadSnapshot,
  ValidationPolicy,
  ValidationTask,
} from "@paperclipai/shared";
const JULES = new Set([
  "frontend_experiment",
  "fake_door",
  "landing_page",
  "prototype",
  "visual",
  "deck",
  "demo",
  "campaign_asset",
]);
export function resolveValidationRuntime(task: ValidationTask) {
  if (task.workClass === "product_backend")
    return { runtime: null, blocker: "FOUNDER_ENGINEERING_DEPENDENCY" };
  if (["lead_search", "outreach"].includes(task.workClass))
    return { runtime: null, blocker: "BLOCKED_ON_COMMERCIAL_APPROVAL" };
  if (JULES.has(task.workClass)) return { runtime: "jules", blocker: null };
  if (
    ["ethnography", "community_exploration", "customer_interaction"].includes(
      task.workClass,
    )
  )
    return { runtime: "hermes_local", blocker: null };
  return { runtime: "github-actions", blocker: null };
}
export function nextBestValidationActions(
  snapshot: NodepadSnapshot,
  policy: ValidationPolicy,
) {
  return snapshot.hypotheses
    .filter((h) => h.status === "active")
    .map((h) => {
      const contributions = Object.fromEntries(
        Object.entries(policy.weights).map(([key, weight]) => [
          key,
          (h.factors[key] ?? 0) *
            weight *
            ([
              "estimatedTime",
              "estimatedCost",
              "founderEffort",
              "julesRequirement",
            ].includes(key)
              ? -1
              : 1),
        ]),
      );
      return {
        hypothesisId: h.id,
        factors: h.factors,
        weights: policy.weights,
        contributions,
        score: Object.values(contributions).reduce((a, b) => a + b, 0),
        blockedReason: h.blockedReason,
        guidance: h.blockedReason
          ? "Resolve blocker or select unrelated useful work"
          : "Test the highest-impact unresolved uncertainty",
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.hypothesisId.localeCompare(b.hypothesisId),
    );
}
export function classifyValidationOutcome(facts: {
  evidenceAccepted?: boolean;
  hypothesisMoved?: boolean;
  gapClosed?: boolean;
  experimentCompleted?: boolean;
  decisionEnabled?: boolean;
  customerProgress?: boolean;
  reusableArtifact?: boolean;
  maintenance?: boolean;
  duplicate?: boolean;
}) {
  return facts.duplicate
    ? "duplicate_work"
    : facts.hypothesisMoved
      ? "hypothesis_moved"
      : facts.evidenceAccepted
        ? "evidence_accepted"
        : facts.gapClosed
          ? "research_gap_closed"
          : facts.experimentCompleted
            ? "experiment_completed"
            : facts.decisionEnabled
              ? "decision_enabled"
              : facts.customerProgress
                ? "customer_progress"
                : facts.reusableArtifact
                  ? "reusable_artifact"
                  : facts.maintenance
                    ? "maintenance_only"
                    : "no_material_result";
}
