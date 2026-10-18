import { describe, it, expect } from "vitest";
import {
  validationPolicySchema,
  validationTaskSchema,
  workforceNeedSchema,
  type WorkforceNeed,
} from "@paperclipai/shared";
import {
  canonicalWorkforce as catalog,
  validateWorkforceDefinition,
  definitionHash,
} from "../services/workforce/definitions.js";
import {
  routeWorkforceNeed,
  type RoutingContext,
} from "../services/workforce/routing.js";
import { snapshot, interview } from "./fixtures/validation.js";
function context(): RoutingContext {
  const state = snapshot();
  state.hypotheses[0].blockedReason = null;
  state.hypotheses[0].secondaryCount = 0;
  state.hypotheses[0].directCount = 3;
  state.interviews = [interview(1), interview(2), interview(3)];
  state.researchGaps = [
    "customer_language",
    "dataset_analysis",
    "counter_hypothesis",
    "pricing_wtp",
    "fake_door",
    "go_pivot_stop",
    "visual",
  ];
  state.evidence = [
    "target_customer:1",
    "problem:1",
    "customer_language:1",
    "proposition:1",
    "counter_hypothesis:1",
  ];
  return {
    phase: "CONCENTRATE",
    policy: validationPolicySchema.parse({}),
    snapshot: state,
    members: catalog.agents.map((a) => ({
      id: a.agencyId,
      agentId: a.agencyId,
      state: a.activation.defaultState,
      drift: "current",
      definition: a,
      overrides: {},
    })),
    runtimes: { "github-actions": true, hermes_local: true, jules: true },
    approved: false,
    activeHypothesisIds: [],
    paused: false,
  };
}
function need(
  gap: string,
  stage: WorkforceNeed["stage"],
  workClass: string,
  extra: Record<string, unknown> = {},
): WorkforceNeed {
  return workforceNeedSchema.parse({
    eventKey: `${gap}:${stage}`,
    eventType: "research_gap",
    gap,
    stage,
    hypothesisId: "H-021",
    sourceGapRef: gap,
    datasetRefs: [],
    reason: "Resolve the named uncertainty with the smallest useful task",
    validationTask: validationTaskSchema.parse({
      workClass,
      hypothesisIds: ["H-021"],
      writeScopes: stage === "frontend" ? ["website/**"] : [],
      experimentQuestion: "Will customers request a conversation?",
      behavioralMetric: "Distinct qualified requests / qualified visitors",
    }),
    economics: {
      informationGain: 0.8,
      timeToSignalHours: 2,
      cashCostCents: 0,
      founderMinutes: 10,
      julesStarts: 0,
      externalInteractionBurden: "None",
    },
    ...extra,
  });
}
const route = (n: WorkforceNeed, c = context()) =>
  routeWorkforceNeed(catalog, n, c);
describe("reviewed canonical Agency inventory", () => {
  it("imports exact active catalog, preserved IDs and bounded methodology rather than legacy personas", () => {
    expect(catalog.agents).toHaveLength(45);
    expect(catalog.divisions).toHaveLength(9);
    expect(catalog.skills).toHaveLength(28);
    expect(catalog.workflows).toHaveLength(13);
    expect(catalog.providerCapabilities).toHaveLength(8);
    expect(
      catalog.agents.filter((a) => a.activation.defaultState === "DORMANT"),
    ).toHaveLength(44);
    expect(
      catalog.agents.find((a) => a.agencyId === "value-position-designer")
        ?.aliases,
    ).toContain("value-proposition-designer");
    expect(catalog.source.license).toContain("MIT");
  });
  it("rejects invalid definitions and hashes JSONB key order consistently", () => {
    const bad = structuredClone(catalog);
    bad.agents.push(bad.agents[0]);
    expect(() => validateWorkforceDefinition(bad)).toThrow();
    expect(definitionHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      definitionHash({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });
});
describe("capability routes A–H and runtime policy", () => {
  it("A: routes customer language collection to Community Scout on Hermes", () => {
    expect(
      route(need("customer_language", "collection", "community_exploration"))
        .recommendations[0],
    ).toMatchObject({ agencyId: "community-scout", runtime: "hermes_local" });
  });
  it("B: keeps dataset interpretation on Actions and requires a dataset", () => {
    const n = need("dataset_analysis", "analysis", "analysis");
    expect(route(n).status).toBe("BLOCKED");
    n.datasetRefs = ["github:interviews/accepted.json"];
    expect(route(n).recommendations[0]).toMatchObject({
      agencyId: "customer-investigator",
      runtime: "github-actions",
    });
  });
  it("C: activates an independent counter-hypothesis specialist", () => {
    expect(
      route(need("counter_hypothesis", "analysis", "analysis"))
        .recommendations[0].agencyId,
    ).toBe("counter-hypothesis-generator");
  });
  it("D: sends pricing design to Actions, implementation to Jules, completed results to WTP Skeptic", () => {
    expect(
      route(need("pricing_wtp", "design", "analysis")).recommendations[0],
    ).toMatchObject({
      agencyId: "pricing-test-designer",
      runtime: "github-actions",
    });
    expect(
      route(need("pricing_wtp", "frontend", "frontend_experiment"))
        .recommendations[0]?.runtime,
    ).toBe("jules");
    const n = need("pricing_wtp", "evaluation", "experiment_evaluation", {
      eventType: "experiment_completed",
    });
    expect(route(n).recommendations[0]?.agencyId).toBe("wtp-skeptic");
  });
  it("E: uses one stable Fake Door agent across design and gated frontend", () => {
    expect(
      route(need("fake_door", "design", "analysis")).recommendations[0],
    ).toMatchObject({
      agencyId: "fake-door-designer",
      runtime: "github-actions",
    });
    expect(
      route(need("fake_door", "frontend", "fake_door")).recommendations[0],
    ).toMatchObject({ agencyId: "fake-door-designer", runtime: "jules" });
    const c = context();
    c.snapshot!.evidence = [];
    expect(route(need("fake_door", "frontend", "fake_door"), c).status).toBe(
      "FAKE_DOOR_NOT_READY",
    );
  });
  it("F: blocks filler at a human interview gate, allowing interview preparation", () => {
    const c = context();
    c.snapshot!.hypotheses[0].blockedReason = "BLOCKED_ON_HUMAN_INTERVIEW";
    expect(
      route(need("customer_language", "collection", "community_exploration"), c)
        .status,
    ).toBe("BLOCKED_ON_HUMAN_INTERVIEW");
    const n = need("customer_language", "interview_preparation", "analysis");
    n.validationTask.resolvesBlocker = true;
    expect(route(n, c).recommendations[0]?.agencyId).toBe("community-scout");
  });
  it("G: returns a founder dependency for product/backend engineering", () => {
    expect(route(need("fake_door", "frontend", "product_backend")).status).toBe(
      "FOUNDER_ENGINEERING_DEPENDENCY",
    );
  });
  it("H: routes strategic conclusions to Venture Judge at handoff", () => {
    const c = context();
    c.phase = "FOUNDER_HANDOFF";
    expect(
      route(need("go_pivot_stop", "decision", "synthesis"), c)
        .recommendations[0]?.agencyId,
    ).toBe("venture-judge");
  });
  it("does not substitute Jules when interactive Hermes is unavailable", () => {
    const c = context();
    c.runtimes.hermes_local = false;
    expect(
      route(
        need("customer_language", "collection", "community_exploration"),
        c,
      ),
    ).toMatchObject({ status: "READY_CONFIG", recommendations: [] });
  });
  it("respects dormancy, disabled overrides, no blanket team chains and phase eligibility", () => {
    const n = need("customer_language", "collection", "community_exploration"),
      c = context();
    expect(route(n, c).recommendations).toHaveLength(1);
    c.members.find(
      (m) => m.definition.agencyId === "community-scout",
    )!.overrides.disabled = true;
    expect(route(n, c).recommendations).toHaveLength(0);
    c.phase = "FOUNDER_HANDOFF";
    expect(
      route(need("fake_door", "frontend", "fake_door"), c).recommendations,
    ).toHaveLength(0);
  });
  it("enforces WIP, primary convergence and current canonical gap references", () => {
    const c = context();
    c.activeHypothesisIds = ["other-a", "other-b", "other-c"];
    expect(route(need("fake_door", "design", "analysis"), c).status).toBe(
      "WIP_LIMIT",
    );
    const n = need("fake_door", "design", "analysis");
    n.sourceGapRef = "invented";
    expect(route(n).status).toBe("BLOCKED");
  });
  it("requires readiness even for visual and campaign-style production", () => {
    const c = context();
    c.snapshot!.interviews = [];
    expect(route(need("visual", "frontend", "visual"), c).status).toBe(
      "FAKE_DOOR_NOT_READY",
    );
  });
});
