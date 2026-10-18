import {
  countJulesStarts,
  writeScopesOverlap,
} from "../services/jules-capacity-broker.js";
import { describe, it, expect } from "vitest";
import {
  adaptationSchema,
  decisionRequestSchema,
  managementCycleSchema,
  validationPolicySchema,
  validationTaskSchema,
  ventureHandoffSchema,
} from "@paperclipai/shared";
import {
  adaptationAuthority,
  businessDaysSince,
  nextPhase,
  programmeClock,
  programmeDiagnostics,
} from "../services/validation/programme-policy.js";
import {
  evidenceGate,
  validationTaskGate,
} from "../services/validation/evidence-policy.js";
import { decisionAuthority } from "../services/validation/decisions.js";
import {
  classifyValidationOutcome,
  nextBestValidationActions,
  resolveValidationRuntime,
} from "../services/validation/runtime.js";
import {
  assertNodepadScope,
  nodepadHttpProvider,
} from "../services/validation/nodepad.js";
import { normalizeActionsResult } from "../services/validation/github-actions.js";
import {
  snapshot,
  interview,
  adaptation,
  decision,
  NOW,
  COMPANY_ID,
} from "./fixtures/validation.js";
const policy = validationPolicySchema.parse({});
describe("validation active-time and adaptive programme", () => {
  it("separates calendar, active, phase and explicit pause time", () => {
    const clock = programmeClock(
      new Date("2026-10-01Z"),
      new Date("2026-10-10Z"),
      [
        {
          start: "2026-10-05Z",
          end: "2026-10-07Z",
          reason: "Founder unavailable",
        },
        { start: "2026-10-12Z", end: null, reason: "Service outage" },
      ],
      new Date("2026-10-16Z"),
    );
    expect(clock).toMatchObject({
      calendarDays: 15,
      pausedDays: 6,
      activeDays: 9,
      phaseActiveDays: 2,
      activeWeek: 2,
    });
  });
  it("does not double count overlapping pauses or count ordinary waiting", () => {
    expect(
      programmeClock(
        new Date("2026-10-01Z"),
        new Date("2026-10-01Z"),
        [],
        new Date("2026-10-05Z"),
      ).activeDays,
    ).toBe(4);
    expect(
      programmeClock(
        new Date("2026-10-01Z"),
        new Date("2026-10-01Z"),
        [
          { start: "2026-10-02Z", end: "2026-10-04Z", reason: "a" },
          { start: "2026-10-03Z", end: "2026-10-05Z", reason: "b" },
        ],
        new Date("2026-10-05Z"),
      ).pausedDays,
    ).toBe(3);
  });
  it("requires founder authority for early exit, large extensions and pause", () => {
    expect(
      adaptationAuthority(adaptationSchema.parse(adaptation), policy),
    ).toBe("ceo");
    for (const change of [
      { action: "EXIT_PHASE_EARLY" },
      { action: "PAUSE_PROGRAMME" },
      { deltaDays: 3 },
    ])
      expect(
        adaptationAuthority(
          adaptationSchema.parse({ ...adaptation, ...change }),
          policy,
        ),
      ).toBe("founder");
    expect(nextPhase("EXPLORE")).toBe("CONCENTRATE");
    expect(nextPhase("FOUNDER_HANDOFF")).toBe("FOUNDER_HANDOFF");
  });
  it("derives convergence, ageing, phase and direct-evidence debt transparently", () => {
    const state = snapshot();
    state.hypotheses = Array.from({ length: 11 }, (_, i) => ({
      ...state.hypotheses[0],
      id: `H-${i}`,
    }));
    const result = programmeDiagnostics(state, "REFINE", 35, policy, NOW);
    expect(result.metrics).toMatchObject({
      active: 11,
      primary: 11,
      stale: 11,
    });
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "HYPOTHESIS_SPRAWL",
        "CONVERGENCE_BEHIND_PLAN",
        "PHASE_DEBT",
        "DIRECT_EVIDENCE_DEBT",
        "CUSTOMER_INTERACTION_DEBT",
        "EXPERIMENT_DEBT",
        "PROPOSITION_DEBT",
        "EXCESS_SECONDARY_RESEARCH",
      ]),
    );
    expect(businessDaysSince("2026-10-09T12:00:00Z", NOW)).toBe(5);
  });
});
describe("human evidence gates and hard blockers", () => {
  it("rejects absent and uploaded but unanalyzed interviews", () => {
    const s = snapshot();
    expect(evidenceGate(s, "problem", policy).passed).toBe(false);
    s.interviews = [
      interview(1, false),
      interview(2, false),
      interview(3, false),
    ];
    expect(evidenceGate(s, "problem", policy).count).toBe(0);
  });
  it("requires provenance, analysis, relevance, distinct sources and stricter counts", () => {
    const s = snapshot();
    s.interviews = [interview(1), interview(2), interview(3)];
    expect(evidenceGate(s, "problem", policy).passed).toBe(true);
    expect(evidenceGate(s, "icp", policy).passed).toBe(false);
    expect(
      evidenceGate(
        s,
        "problem",
        validationPolicySchema.parse({
          interviewGates: { problem: 4, icp: 6, commercial: 9 },
        }),
      ).passed,
    ).toBe(false);
    s.interviews[2] = s.interviews[1];
    expect(evidenceGate(s, "problem", policy).passed).toBe(false);
    expect(
      validationPolicySchema.safeParse({
        interviewGates: { problem: 1, icp: 1, commercial: 1 },
      }).success,
    ).toBe(false);
  });
  it("suppresses filler against interview-blocked hypotheses while permitting blocker resolution", () => {
    const task = validationTaskSchema.parse({
      workClass: "analysis",
      hypothesisIds: ["H-021"],
    });
    expect(validationTaskGate(task, snapshot(), policy).blocker).toBe(
      "BLOCKED_ON_HUMAN_INTERVIEW",
    );
    expect(
      validationTaskGate({ ...task, resolvesBlocker: true }, snapshot(), policy)
        .allowed,
    ).toBe(true);
    const state = snapshot();
    state.hypotheses[0].blockedReason = null;
    expect(validationTaskGate(task, state, policy).blocker).toBe(
      "BLOCK_SECONDARY_RESEARCH",
    );
  });
  it("blocks unjustified fake doors and accepts an explicit evidence-backed experiment", () => {
    const task = validationTaskSchema.parse({
      workClass: "fake_door",
      hypothesisIds: ["H-021"],
      experimentQuestion: "Will customers join?",
      behavioralMetric: "Qualified signup conversion",
    });
    const s = snapshot();
    expect(validationTaskGate(task, s, policy).allowed).toBe(false);
    s.interviews = [interview(1), interview(2), interview(3)];
    s.evidence = [
      "target_customer:1",
      "problem:1",
      "customer_language:1",
      "proposition:1",
      "counter_hypothesis:1",
    ];
    expect(validationTaskGate(task, s, policy).allowed).toBe(true);
  });
});
describe("decision authority and runtime invariants", () => {
  it("validates recommendation options and escalates high-impact irreversible actions", () => {
    expect(
      decisionRequestSchema.safeParse({ ...decision, recommendedOption: "C" })
        .success,
    ).toBe(false);
    expect(
      decisionAuthority(decisionRequestSchema.parse(decision), NOW),
    ).toEqual({ authority: "ceo", queue: "ceo" });
    expect(
      decisionAuthority(
        decisionRequestSchema.parse({
          ...decision,
          reversible: false,
          impact: "high",
        }),
        NOW,
      ),
    ).toEqual({ authority: "founder", queue: "urgent" });
    expect(
      decisionAuthority(
        decisionRequestSchema.parse({ ...decision, category: "vision" }),
        NOW,
      ).queue,
    ).toBe("briefing");
  });
  it.each([
    ["analysis", "github-actions"],
    ["experiment_evaluation", "github-actions"],
    ["ethnography", "hermes_local"],
    ["fake_door", "jules"],
    ["product_backend", null],
    ["outreach", null],
  ])("routes %s to %s", (workClass, runtime) => {
    expect(
      resolveValidationRuntime(validationTaskSchema.parse({ workClass }))
        .runtime,
    ).toBe(runtime);
  });
  it("ranks factors deterministically without treating them as qualification", () => {
    const s = snapshot();
    s.hypotheses.push({
      ...s.hypotheses[0],
      id: "H-022",
      factors: { estimatedCost: 1 },
    });
    const ranked = nextBestValidationActions(s, policy);
    expect(ranked[0].hypothesisId).toBe("H-021");
    expect(ranked[0].contributions.businessImpact).toBe(3);
    expect(ranked[0]).not.toHaveProperty("qualification");
    expect(classifyValidationOutcome({ hypothesisMoved: true })).toBe(
      "hypothesis_moved",
    );
    expect(classifyValidationOutcome({})).toBe("no_material_result");
  });
  it("requires complete handoff and caps management cycles at three outcomes", () => {
    expect(
      ventureHandoffSchema.safeParse({ recommendation: "BUILD_RECOMMENDED" })
        .success,
    ).toBe(false);
    expect(
      managementCycleSchema.safeParse({ mustWinOutcomes: ["a", "b", "c", "d"] })
        .success,
    ).toBe(false);
  });
});
describe("provider boundaries", () => {
  it("rejects cross-company/workspace Nodepad projections", () => {
    const binding = {
      companyId: COMPANY_ID,
      workspaceId: "workspace-a",
      baseUrl: "https://nodepad.example",
      apiKeySecretRef: "ref",
    };
    expect(() => assertNodepadScope(snapshot(), binding)).not.toThrow();
    expect(() =>
      assertNodepadScope(snapshot(), { ...binding, companyId: "other" }),
    ).toThrow(/boundary/);
    expect(() =>
      assertNodepadScope(snapshot(), { ...binding, workspaceId: "other" }),
    ).toThrow(/boundary/);
  });
  it("exposes candidate submission, never qualification mutation", () => {
    const provider = nodepadHttpProvider();
    expect(Object.keys(provider).sort()).toEqual([
      "mode",
      "proposeCounterHypothesis",
      "proposeExperiment",
      "proposeHypothesis",
      "proposeResearchGap",
      "read",
      "submitEvidence",
      "submitExperimentResult",
    ]);
  });
  it.each([
    ["success", true],
    ["failure", false],
    ["cancelled", false],
    ["timed_out", false],
    ["skipped", false],
  ])(
    "maps Actions conclusion %s without false success",
    (conclusion, succeeded) => {
      expect(
        normalizeActionsResult({
          id: 1,
          display_title: "paperclip:run",
          status: "completed",
          conclusion,
          html_url: "https://github.com/acme/repo/actions/runs/1",
        }).succeeded,
      ).toBe(succeeded);
    },
  );
});

describe("Jules physical-account edge cases", () => {
  it("counts a retry once even when both start ledger events exist", () => {
    expect(
      countJulesStarts([
        { eventType: "session_started", sessionId: "retry-1" },
        { eventType: "session_retry_started", sessionId: "retry-1" },
      ]),
    ).toBe(1);
  });
  it("treats wildcards within a path segment conservatively", () => {
    expect(
      writeScopesOverlap(["site/landing*"], ["site/landing-page/index.html"]),
    ).toBe(true);
    expect(writeScopesOverlap(["site/a/**"], ["site/b/**"])).toBe(false);
  });
});
