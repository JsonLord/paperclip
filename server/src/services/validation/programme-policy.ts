import {
  VALIDATION_PHASES,
  type AdaptationProposal,
  type ValidationPhase,
  type ValidationPolicy,
  type NodepadSnapshot,
  type NodepadHypothesis,
} from "@paperclipai/shared";
const DAY = 86_400_000;
export interface PauseInterval {
  start: string;
  end: string | null;
  reason: string;
}
export function programmeClock(
  start: Date,
  phaseStart: Date,
  pauses: PauseInterval[],
  now: Date,
) {
  const duration = (from: Date) => Math.max(0, now.getTime() - from.getTime());
  const paused = (from: Date) => {
    const intervals = pauses
      .map((p) => [
        Math.max(from.getTime(), Date.parse(p.start)),
        Math.min(now.getTime(), p.end ? Date.parse(p.end) : now.getTime()),
      ])
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let total = 0,
      end = from.getTime();
    for (const [a, b] of intervals) {
      total += Math.max(0, b - Math.max(a, end));
      end = Math.max(end, b);
    }
    return total;
  };
  const activeDays = (duration(start) - paused(start)) / DAY;
  return {
    calendarDays: duration(start) / DAY,
    activeDays,
    activeWeek: Math.floor(activeDays / 7) + 1,
    pausedDays: paused(start) / DAY,
    phaseActiveDays: (duration(phaseStart) - paused(phaseStart)) / DAY,
  };
}
export function adaptationAuthority(
  proposal: AdaptationProposal,
  policy: ValidationPolicy,
) {
  const operational = [
    "CONTINUE_PHASE",
    "EXTEND_PHASE",
    "COMPRESS_PHASE",
  ].includes(proposal.action);
  return operational &&
    Math.abs(proposal.deltaDays) <= policy.autonomousTimingDays
    ? "ceo"
    : "founder";
}
export function nextPhase(phase: ValidationPhase) {
  return VALIDATION_PHASES[
    Math.min(VALIDATION_PHASES.indexOf(phase) + 1, VALIDATION_PHASES.length - 1)
  ];
}
export function businessDaysSince(value: string, now: Date) {
  const start = new Date(value);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (start < end) {
    start.setUTCDate(start.getUTCDate() + 1);
    if (start.getUTCDay() !== 0 && start.getUTCDay() !== 6) count++;
  }
  return count;
}
export function programmeDiagnostics(
  snapshot: NodepadSnapshot,
  phase: ValidationPhase,
  phaseActiveDays: number,
  policy: ValidationPolicy,
  now: Date,
  previous?: {
    hypotheses: Array<Pick<NodepadHypothesis, "id" | "status" | "primary">>;
  } | null,
) {
  const active = snapshot.hypotheses.filter((h) => h.status === "active");
  const primary = active.filter((h) => h.primary);
  const priority = active.filter((h) => h.priority);
  const warnings: Array<{
    code: string;
    refs: string[];
    inputs: Record<string, unknown>;
  }> = [];
  const warn = (
    code: string,
    refs: string[],
    inputs: Record<string, unknown>,
  ) => warnings.push({ code, refs, inputs });
  const max = phase === "EXPLORE" ? 15 : phase === "CONCENTRATE" ? 7 : 3;
  if (active.length > max)
    warn(
      "HYPOTHESIS_SPRAWL",
      active.map((h) => h.id),
      { count: active.length, expectedMaximum: max, phase },
    );
  if (priority.length > policy.maxActivePriority)
    warn(
      "HYPOTHESIS_WIP_EXCEEDED",
      priority.map((h) => h.id),
      { count: priority.length, limit: policy.maxActivePriority },
    );
  if (
    phase !== "EXPLORE" &&
    active.length > max &&
    phaseActiveDays > policy.phaseDays[phase] / 2
  )
    warn("CONVERGENCE_BEHIND_PLAN", [], {
      active: active.length,
      target: max,
      phaseActiveDays,
    });
  if (phaseActiveDays > policy.phaseDays[phase])
    warn("PHASE_DEBT", [], {
      phaseActiveDays,
      target: policy.phaseDays[phase],
    });
  for (const h of primary) {
    const age = businessDaysSince(
      h.lastMaterialAt ?? h.primarySince ?? h.createdAt,
      now,
    );
    if (age >= 3)
      warn("PRIMARY_HYPOTHESIS_STALE", [h.id], {
        businessDays: age,
        mandatoryReview: age >= 7,
        dispositionRequired:
          age >= 14 ||
          (h.reviewDeadline !== null &&
            Date.parse(h.reviewDeadline) < now.getTime()),
      });
    if (h.nextGate && h.directCount === 0)
      warn("DIRECT_EVIDENCE_DEBT", [h.id], {
        gate: h.nextGate,
        directCount: h.directCount,
      });
    if (
      h.nextGate &&
      h.secondaryCount >= policy.saturation.minimumSecondary &&
      h.directCount / Math.max(1, h.secondaryCount + h.directCount) <=
        policy.saturation.maximumDirectRatio &&
      h.marginalValue <= policy.saturation.minimumMarginalValue
    )
      warn("EXCESS_SECONDARY_RESEARCH", [h.id], {
        ...policy.saturation,
        secondaryCount: h.secondaryCount,
        directCount: h.directCount,
        marginalValue: h.marginalValue,
      });
  }
  if (phase !== "EXPLORE") {
    if (
      !snapshot.clocks.lastCustomerInteractionAt ||
      businessDaysSince(snapshot.clocks.lastCustomerInteractionAt, now) >= 7
    )
      warn("CUSTOMER_INTERACTION_DEBT", [], {
        lastAt: snapshot.clocks.lastCustomerInteractionAt,
      });
    if (!snapshot.experiments.some((e) => e.completedAt))
      warn("EXPERIMENT_DEBT", [], { completedExperiments: 0 });
    if (snapshot.researchGaps.some((g) => /proposition/i.test(g)))
      warn("PROPOSITION_DEBT", [], { gaps: snapshot.researchGaps });
  }
  const old = new Map(previous?.hypotheses.map((h) => [h.id, h]) ?? []);
  if (phase === "REFINE" && previous) {
    const added = primary.filter((h) => !old.get(h.id)?.primary);
    if (
      added.length &&
      primary.length >
        previous.hypotheses.filter((h) => h.primary && h.status === "active")
          .length
    )
      warn(
        "PRIMARY_EXPANSION_REQUIRES_DISPOSITION",
        added.map((h) => h.id),
        { materialChanges: snapshot.materialChanges },
      );
  }
  return {
    metrics: {
      total: snapshot.hypotheses.length,
      active: active.length,
      priority: priority.length,
      primary: primary.length,
      created: snapshot.hypotheses.filter((h) => !old.has(h.id)).length,
      merged: snapshot.hypotheses.filter((h) => h.status === "merged").length,
      archived: snapshot.hypotheses.filter((h) => h.status === "archived")
        .length,
      disconfirmed: snapshot.hypotheses.filter(
        (h) => h.status === "disconfirmed",
      ).length,
      materiallyMoved: snapshot.materialChanges.length,
      stale: primary.filter(
        (h) => businessDaysSince(h.lastMaterialAt ?? h.createdAt, now) >= 3,
      ).length,
      blocked: active.filter((h) => h.blockedReason).length,
      directEvidenceDependent: active.filter((h) => h.nextGate).length,
    },
    warnings,
  };
}
