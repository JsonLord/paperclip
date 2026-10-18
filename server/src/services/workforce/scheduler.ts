import { and, eq, desc } from "drizzle-orm";
import {
  agents,
  workforceMembers,
  workforceActivations,
  nodepadBindings,
  validationProgrammes,
  type Db,
} from "@paperclipai/db";
import { workforceService } from "./service.js";
/** Only the reporting exception has a timer. Specialists never receive empty periodic tasks. */
export async function tickWorkforceReporters(
  db: Db,
  now: Date,
  wake: (
    agentId: string,
    issueId: string,
    eventKey: string,
  ) => Promise<unknown>,
) {
  const reporters = await db
    .select()
    .from(workforceMembers)
    .where(
      and(
        eq(workforceMembers.agencyId, "founder-intelligence-reporter"),
        eq(workforceMembers.state, "AVAILABLE"),
      ),
    );
  let enqueued = 0;
  for (const member of reporters) {
    if (
      member.overrides.disabled ||
      member.overrides.paused ||
      member.drift === "upstream_removed"
    )
      continue;
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, member.agentId));
    if (
      !agent ||
      ["paused", "terminated", "pending_approval"].includes(agent.status)
    )
      continue;
    const [previous] = await db
      .select()
      .from(workforceActivations)
      .where(eq(workforceActivations.memberId, member.id))
      .orderBy(desc(workforceActivations.createdAt))
      .limit(1);
    if (
      now.getTime() - (previous?.createdAt ?? member.importedAt).getTime() <
      member.definition.activation.scheduleSec * 1000
    )
      continue;
    const [p] = await db
      .select()
      .from(validationProgrammes)
      .where(eq(validationProgrammes.companyId, member.companyId));
    const [b] = await db
      .select()
      .from(nodepadBindings)
      .where(eq(nodepadBindings.companyId, member.companyId));
    const hypothesis = b?.snapshot?.hypotheses.find(
      (h) => h.status === "active" && (h.primary || h.priority),
    );
    if (!p || p.pausedAt || !b?.snapshot || !hypothesis) continue;
    const eventKey = `reporter:${now.toISOString().slice(0, 10)}`;
    const result = await workforceService(db, { wake }).activate(
      member.companyId,
      {
        eventKey,
        eventType: "reporting_tick",
        gap: "founder_intelligence",
        stage: "analysis",
        agencyId: member.agencyId,
        hypothesisId: hypothesis.id,
        sourceGapRef: b.snapshot.revision,
        datasetRefs: [],
        reason:
          "Daily independent founder intelligence: inspect host-computed metrics, expose inactivity and blocked decisions without manufacturing work or evidence",
        validationTask: {
          workClass: "report",
          hypothesisIds: [hypothesis.id],
          writeScopes: [],
        },
        economics: {
          informationGain: 0.5,
          timeToSignalHours: 1,
          cashCostCents: 0,
          founderMinutes: 0,
          julesStarts: 0,
          externalInteractionBurden: "None",
        },
      },
      "workforce_scheduler",
    );
    if (result.status === "ACTIVATED") enqueued++;
  }
  return enqueued;
}
