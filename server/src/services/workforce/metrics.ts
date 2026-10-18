import { eq } from "drizzle-orm";
import {
  workforceMembers,
  workforceActivations,
  nodepadBindings,
  heartbeatRuns,
  costEvents,
  type Db,
} from "@paperclipai/db";
/** Host facts only. Reports and activity are explicitly separated from canonical evidence. */
export async function workforceMetrics(db: Db, companyId: string) {
  const [members, activations, runs, costs, bindings] = await Promise.all([
    db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.companyId, companyId)),
    db
      .select()
      .from(workforceActivations)
      .where(eq(workforceActivations.companyId, companyId)),
    db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.companyId, companyId)),
    db.select().from(costEvents).where(eq(costEvents.companyId, companyId)),
    db
      .select()
      .from(nodepadBindings)
      .where(eq(nodepadBindings.companyId, companyId)),
  ]);
  const snapshot = bindings[0]?.snapshot;
  const completed = activations.filter((a) => a.status === "DONE"),
    busy = completed.filter((a) => a.result?.outcome === "no_material_result");
  return {
    version: "agency-host-metrics/v1",
    states: Object.fromEntries(
      [
        "DORMANT",
        "AVAILABLE",
        "ACTIVE",
        "WAITING",
        "BLOCKED",
        "PAUSED",
        "DISABLED",
      ].map((state) => [
        state,
        members.filter((m) => m.state === state).length,
      ]),
    ),
    activationCount: activations.length,
    completedTasks: completed.length,
    blockedTasks: activations.filter((a) => a.status === "BLOCKED").length,
    registeredArtifactReferences: completed.reduce(
      (n, a) => n + (a.result?.artifactIds.length ?? 0),
      0,
    ),
    claimedOutcomes: Object.fromEntries(
      [...new Set(completed.map((a) => a.result?.outcome ?? "unknown"))].map(
        (outcome) => [
          outcome,
          completed.filter((a) => a.result?.outcome === outcome).length,
        ],
      ),
    ),
    canonical: snapshot
      ? {
          revision: snapshot.revision,
          evidenceCount: snapshot.evidence.length,
          acceptedHumanInterviews: snapshot.interviews.filter(
            (i) =>
              i.humanLed && i.analysisStatus === "accepted" && i.pipelineRunRef,
          ).length,
          activeHypotheses: snapshot.hypotheses.filter(
            (h) => h.status === "active",
          ).length,
          priorityHypotheses: snapshot.hypotheses.filter(
            (h) => h.status === "active" && h.priority,
          ).length,
          completedExperiments: snapshot.experiments.filter(
            (e) => e.completedAt,
          ).length,
          researchGaps: snapshot.researchGaps.length,
        }
      : null,
    canonicalMovementObservation: {
      firstRecordedRunAt: runs.length
        ? new Date(
            Math.min(...runs.map((r) => r.createdAt.getTime())),
          ).toISOString()
        : null,
      lastMaterialMovementAt: snapshot?.clocks.lastMaterialMovementAt ?? null,
      signal:
        runs.length &&
        (!snapshot?.clocks.lastMaterialMovementAt ||
          Date.parse(snapshot.clocks.lastMaterialMovementAt) <
            Math.min(...runs.map((r) => r.createdAt.getTime())))
          ? "ACTIVITY_WITHOUT_CANONICAL_PROGRESS"
          : "NO_ABSENCE_DETECTED",
      meaning:
        "No canonical material movement observed since the first recorded runtime run; execution and artifacts are not validation.",
    },
    runtimeRuns: runs.length,
    runtimeFailures: runs.filter((r) => r.status === "failed").length,
    costCents: costs.reduce((n, c) => n + c.costCents, 0),
    busyWorkRatio: {
      numerator: busy.length,
      denominator: completed.length,
      value: completed.length ? busy.length / completed.length : null,
    },
    interpretation:
      "Task outputs and claimed outcomes are not canonical evidence, validation or traction. Missing denominators remain null.",
  };
}
