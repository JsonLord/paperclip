import {
  validationTaskGate,
  evidenceGate,
} from "../validation/evidence-policy.js";
import { resolveValidationRuntime } from "../validation/runtime.js";
import type {
  ValidationWorkforceDefinition,
  WorkforceAgentDefinition,
  WorkforceNeed,
  WorkforceOverride,
  NodepadSnapshot,
  ValidationPolicy,
  ValidationPhase,
} from "@paperclipai/shared";
export const GAP_ALIASES: Record<string, string> = {
  pricing_wtp: "pricing_test",
  willingness_to_pay: "wtp_challenge",
  strong_support: "counter_hypothesis",
};
export interface RoutingMember {
  id: string;
  agentId: string;
  state: string;
  drift: string;
  definition: WorkforceAgentDefinition;
  overrides: WorkforceOverride;
}
export interface RoutingContext {
  phase: ValidationPhase;
  policy: ValidationPolicy;
  snapshot: NodepadSnapshot | null;
  members: RoutingMember[];
  runtimes: Record<string, boolean>;
  approved: boolean;
  activeHypothesisIds: string[];
  paused: boolean;
}
const stageClasses: Record<string, string[]> = {
  collection: ["ethnography", "community_exploration", "customer_interaction"],
  analysis: [
    "analysis",
    "synthesis",
    "evidence_check",
    "report",
    "experiment_evaluation",
  ],
  design: ["analysis", "synthesis", "experiment_evaluation"],
  frontend: [
    "fake_door",
    "frontend_experiment",
    "landing_page",
    "prototype",
    "visual",
    "deck",
    "demo",
    "campaign_asset",
  ],
  evaluation: ["experiment_evaluation", "evidence_check"],
  decision: ["synthesis", "report", "analysis"],
  interview_preparation: ["evidence_check", "analysis"],
};
export function routeWorkforceNeed(
  definition: ValidationWorkforceDefinition,
  need: WorkforceNeed,
  context: RoutingContext,
) {
  const blocked = (status: string, reason: string) => ({
    status,
    reason,
    recommendations: [] as Array<{
      agencyId: string;
      memberId: string;
      agentId: string;
      capability: string;
      runtime: string;
      reason: string;
    }>,
  });
  if (
    need.validationTask.workClass === "product_backend" ||
    /\b(production backend|production api|production database|authentication backend|billing backend|inference infrastructure|scalable application architecture)\b/i.test(
      need.reason,
    )
  )
    return blocked(
      "FOUNDER_ENGINEERING_DEPENDENCY",
      "Product/backend engineering belongs to the founder",
    );
  if (context.paused)
    return blocked("BLOCKED", "Programme is explicitly paused");
  const snapshot = context.snapshot;
  if (!snapshot)
    return blocked(
      "READY_CONFIG",
      "Company Nodepad projection is not available",
    );
  const h = snapshot.hypotheses.find(
    (h) => h.id === need.hypothesisId && h.status === "active",
  );
  if (!h) return blocked("BLOCKED", "Active canonical hypothesis is required");
  if (!need.validationTask.hypothesisIds.includes(need.hypothesisId))
    return blocked(
      "BLOCKED",
      "Task intent must reference the requested canonical hypothesis",
    );
  if (
    !(
      need.eventType === "reporting_tick" &&
      need.agencyId === "founder-intelligence-reporter" &&
      need.sourceGapRef === snapshot.revision
    ) &&
    !snapshot.researchGaps.includes(need.sourceGapRef) &&
    !snapshot.materialChanges.includes(need.sourceGapRef) &&
    !snapshot.experiments.some(
      (e) => e.id === need.sourceGapRef && e.completedAt,
    )
  )
    return blocked(
      "BLOCKED",
      "Activation requires a current canonical gap or material-result reference",
    );
  const reporting =
    need.eventType === "reporting_tick" &&
    need.gap === "founder_intelligence" &&
    need.agencyId === "founder-intelligence-reporter" &&
    need.validationTask.workClass === "report";
  const focus = new Set(context.activeHypothesisIds);
  focus.add(need.hypothesisId);
  if (!reporting && focus.size > context.policy.maxActivePriority)
    return blocked(
      "WIP_LIMIT",
      "Activation would exceed programme hypothesis WIP",
    );
  if (
    !reporting &&
    snapshot.hypotheses.filter((h) => h.status === "active" && h.priority)
      .length > context.policy.maxActivePriority &&
    !context.activeHypothesisIds.includes(need.hypothesisId)
  )
    return blocked(
      "WIP_LIMIT",
      "CEO must compress the priority portfolio before adding active work",
    );
  const preparing = need.stage === "interview_preparation";
  if (
    h.blockedReason &&
    !reporting &&
    !preparing &&
    !need.validationTask.differentDependency
  )
    return blocked(
      h.blockedReason,
      "Resolve the human/direct-evidence blocker, rather than adding filler research",
    );
  if (
    preparing &&
    !["BLOCKED_ON_HUMAN_INTERVIEW", "BLOCKED_ON_CUSTOMER_INTERACTION"].includes(
      h.blockedReason ?? "",
    )
  )
    return blocked(
      "BLOCKED",
      "Interview preparation must address an explicit human evidence blocker",
    );
  if (
    need.validationTask.differentDependency &&
    !snapshot.researchGaps.includes(need.validationTask.differentDependency)
  )
    return blocked(
      "BLOCKED",
      "A different dependency must be an actual canonical research gap",
    );
  if (!stageClasses[need.stage].includes(need.validationTask.workClass))
    return blocked(
      "BLOCKED",
      "Task work class conflicts with its declared stage",
    );
  const gate = validationTaskGate(
    need.validationTask,
    snapshot,
    context.policy,
  );
  if (!gate.allowed && !preparing && !reporting)
    return blocked(
      gate.blocker ?? "BLOCKED",
      "Existing validation evidence policy rejected this task",
    );
  if (need.stage === "frontend") {
    if (!need.validationTask.writeScopes.length)
      return blocked(
        "READY_CONFIG",
        "Validation frontend must declare bounded artifact write scopes",
      );
    if (
      need.validationTask.writeScopes.some(
        (scope) =>
          scope.includes("..") ||
          scope.includes("\\") ||
          !/^(site|website|frontend|ui|public|assets|landing|campaign|docs|experiments|prototype)(\/|$)/.test(
            scope,
          ),
      )
    )
      return blocked(
        "FOUNDER_ENGINEERING_DEPENDENCY",
        "Requested write scope escapes validation-facing artifacts",
      );
    const fakeGate = validationTaskGate(
      { ...need.validationTask, workClass: "fake_door" },
      snapshot,
      context.policy,
    );
    if (!fakeGate.allowed)
      return blocked(
        fakeGate.blocker ?? "FAKE_DOOR_NOT_READY",
        "Validation-production requires current customer/problem/proposition/experiment readiness",
      );
  }
  if (
    context.phase !== "EXPLORE" &&
    need.gap === "testable_hypothesis" &&
    !snapshot.materialChanges.includes(need.sourceGapRef)
  )
    return blocked(
      "BLOCKED",
      "After exploration, a new hypothesis requires material canonical evidence rather than portfolio expansion by default",
    );
  const gap = GAP_ALIASES[need.gap] ?? need.gap;
  let candidates = definition.capabilities
    .filter((c) => c.gaps.includes(gap as never))
    .flatMap((c) => c.agentIds.map((id) => ({ id, capability: c.id })));
  if (need.eventType === "experiment_completed") {
    const skeptic: Record<string, string> = {
      pricing_test: "wtp-skeptic",
      fake_door: "demand-skeptic",
      channel_viability: "distribution-skeptic",
    };
    if (skeptic[gap])
      candidates = definition.capabilities
        .filter((c) => c.agentIds.includes(skeptic[gap]))
        .map((c) => ({ id: skeptic[gap], capability: c.id }));
  }
  if (need.agencyId) {
    const match = definition.agents.find(
      (a) => a.agencyId === need.agencyId || a.aliases.includes(need.agencyId!),
    );
    candidates = candidates.filter((c) => c.id === match?.agencyId);
  }
  const runtime = resolveValidationRuntime(need.validationTask);
  if (!runtime.runtime)
    return blocked(
      runtime.blocker!,
      "Existing runtime policy blocked this work",
    );
  if (!context.runtimes[runtime.runtime])
    return blocked(
      "READY_CONFIG",
      `${runtime.runtime} is unavailable; interactive work is never silently sent to Jules`,
    );
  const eligible = candidates.flatMap((c) => {
    const member = context.members.find((m) => m.definition.agencyId === c.id);
    if (
      !member ||
      !["DORMANT", "AVAILABLE", "BLOCKED"].includes(member.state) ||
      member.drift === "upstream_removed" ||
      member.overrides.disabled ||
      member.overrides.paused
    )
      return [];
    const a = member.definition;
    if (
      !(member.overrides.phases ?? a.activation.phases).includes(
        context.phase,
      ) ||
      !a.activation.stages.includes(need.stage)
    )
      return [];
    if (
      member.overrides.restrictCapabilities &&
      !member.overrides.restrictCapabilities.includes(c.capability)
    )
      return [];
    if (need.stage === "collection" && !a.activation.collection) return [];
    if (
      member.overrides.runtimePreference &&
      member.overrides.runtimePreference !== runtime.runtime
    )
      return [];
    if (
      (member.overrides.requireFounderApproval ||
        need.validationTask.workClass === "customer_interaction") &&
      !context.approved
    )
      return [];
    if (
      a.agencyId === "lead-researcher" &&
      !evidenceGate(snapshot, "commercial", context.policy).passed
    )
      return [];
    if (
      need.stage === "analysis" &&
      !need.datasetRefs.length &&
      ["customer-investigator", "customer-language-analyst"].includes(
        a.agencyId,
      )
    )
      return [];
    return [
      {
        agencyId: a.agencyId,
        memberId: member.id,
        agentId: member.agentId,
        capability: c.capability,
        runtime: runtime.runtime!,
        reason: `${need.sourceGapRef}: ${c.capability} resolves ${gap} in ${context.phase}; ${need.stage} uses ${runtime.runtime}. ${need.reason}`,
      },
    ];
  });
  eligible.sort((a, b) => a.agencyId.localeCompare(b.agencyId));
  if (!eligible.length)
    return blocked(
      "BLOCKED",
      "No eligible specialist satisfies phase, capability, evidence, dataset, approval and lifecycle policy",
    );
  return {
    status: "READY",
    reason:
      "Minimum sufficient team: activate one specialist for the current uncertainty; handoffs are recommendations only",
    recommendations: eligible.slice(0, 1),
  };
}
