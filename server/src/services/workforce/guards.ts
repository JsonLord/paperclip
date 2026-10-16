import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import {
  workforceMembers,
  workforceActivations,
  validationProgrammes,
  issues,
  type Db,
} from "@paperclipai/db";
import { forbidden, conflict } from "../../errors.js";
import { type ValidationWorkforceDefinition } from "@paperclipai/shared";
export async function authorizeWorkforceNodepad(
  db: Db,
  companyId: string,
  actorId: string,
  operation: string,
  hypothesisId?: string,
) {
  const [m] = await db
    .select()
    .from(workforceMembers)
    .where(
      and(
        eq(workforceMembers.companyId, companyId),
        eq(workforceMembers.agentId, actorId),
      ),
    );
  if (!m) return null;
  if (
    !["ACTIVE", "WAITING"].includes(m.state) ||
    m.overrides.disabled ||
    m.overrides.paused ||
    m.drift === "upstream_removed"
  )
    throw forbidden("Specialist is not activated for Nodepad access");
  const [a] = await db
    .select()
    .from(workforceActivations)
    .where(
      and(
        eq(workforceActivations.companyId, companyId),
        eq(workforceActivations.memberId, m.id),
        eq(workforceActivations.status, "ACTIVE"),
      ),
    );
  if (!a || (hypothesisId && a.need.hypothesisId !== hypothesisId))
    throw forbidden(
      "Nodepad candidate must belong to the active specialist hypothesis",
    );
  await verifyWorkforceDispatch(db, companyId, actorId, a.issueId);
  const granted = operation.startsWith("nodepad.")
    ? m.definition.nodepad.reads
    : m.definition.nodepad.writes;
  if (!granted.includes(operation as never))
    throw forbidden(`Specialist Nodepad operation is forbidden: ${operation}`);
  return m;
}
export async function verifyWorkforceDispatch(
  db: Db,
  companyId: string,
  agentId: string,
  issueId: string | null,
) {
  const [m] = await db
    .select()
    .from(workforceMembers)
    .where(
      and(
        eq(workforceMembers.companyId, companyId),
        eq(workforceMembers.agentId, agentId),
      ),
    );
  if (!m) return null;
  if (
    m.state !== "ACTIVE" ||
    m.overrides.disabled ||
    m.overrides.paused ||
    m.drift === "upstream_removed"
  )
    throw forbidden(
      "Dormant/disabled specialists need an explicit validation activation",
    );
  const [a] = await db
    .select()
    .from(workforceActivations)
    .where(
      and(
        eq(workforceActivations.companyId, companyId),
        eq(workforceActivations.memberId, m.id),
        eq(
          workforceActivations.issueId,
          issueId ?? "00000000-0000-4000-8000-000000000000",
        ),
        eq(workforceActivations.status, "ACTIVE"),
      ),
    );
  if (!a)
    throw forbidden(
      "Specialist assignment is not its current authorized activation",
    );
  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.companyId, companyId), eq(issues.id, a.issueId!)));
  if (!issue || !isDeepStrictEqual(issue.validationTask, a.need.validationTask))
    throw conflict("Task intent changed after workforce authorization");
  const [programme] = await db
    .select()
    .from(validationProgrammes)
    .where(eq(validationProgrammes.companyId, companyId));
  if (programme?.phase !== a.phase || programme.pausedAt)
    throw conflict(
      "Programme phase or pause invalidated specialist activation",
    );
  return { member: m, activation: a };
}
export function workforcePacket(
  member: typeof workforceMembers.$inferSelect,
  activation: typeof workforceActivations.$inferSelect,
  definition?: ValidationWorkforceDefinition,
) {
  const d = member.definition;
  return {
    version: "agency-task-context/v1",
    agencyId: d.agencyId,
    logicalAgentId: member.agentId,
    activationId: activation.id,
    source: { commit: member.sourceCommit, path: d.sourcePath },
    capability: member.definition.capabilities,
    need: activation.need,
    methodology: d.methodology,
    skills:
      definition?.skills
        .filter((s) => d.skills.includes(s.id))
        .map((s) => ({
          id: s.id,
          version: s.version,
          contentHash: s.contentHash,
          methodology: s.methodology
            .slice(0, 12)
            .map((line) => line.slice(0, 500)),
        })) ?? d.skills,
    nodepad: d.nodepad,
    independent: d.activation.independent,
    browsingAllowed:
      activation.need.stage === "collection" && d.activation.collection,
    boundary:
      "Work only on this activation. No canonical qualification writes, no product/backend engineering, no outreach without its separate approval. Missing data becomes a research gap. Return to dormancy after this work; do not invent another task.",
  };
}
