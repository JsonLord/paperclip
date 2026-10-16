import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  companies,
  approvals,
  nodepadBindings,
  validationProgrammes,
  validationRecords,
  activityLog,
  type Db,
} from "@paperclipai/db";
import {
  validationPolicySchema,
  validationTaskSchema,
  type ValidationTask,
} from "@paperclipai/shared";
import { unprocessable } from "../../errors.js";
import { validationTaskGate } from "./evidence-policy.js";
import { resolveValidationRuntime } from "./runtime.js";

export async function inspectValidationDispatch(
  db: Db,
  companyId: string,
  issue: {
    id?: string;
    title: string;
    description?: string | null;
    validationTask?: ValidationTask | null;
  },
  ceoId?: string,
) {
  const [company] = await db
    .select({ mode: companies.mode })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (company?.mode !== "idea_validation") return null;
  const [programme] = await db
    .select()
    .from(validationProgrammes)
    .where(eq(validationProgrammes.companyId, companyId));
  if (
    issue.id === programme?.directionIssueId &&
    ceoId === programme?.ceoAgentId
  )
    return { runtime: "hermes_local", blocker: null };
  if (programme?.pausedAt)
    return { runtime: null, blocker: "BLOCKED_ON_FOUNDER_DECISION" };
  const parsed = validationTaskSchema.safeParse(issue.validationTask);
  if (!parsed.success)
    return { runtime: null, blocker: "VALIDATION_TASK_INTENT_REQUIRED" };
  const task = parsed.data;
  if (
    /\b(production backend|database architecture|authentication backend|billing backend|inference infrastructure|production api|product.engineering refactor)\b/i.test(
      `${issue.title}\n${issue.description ?? ""}`,
    ) ||
    task.writeScopes.some((s) =>
      /^(server|backend|database|infra|packages\/db)(\/|$)/.test(s),
    )
  )
    return { runtime: null, blocker: "FOUNDER_ENGINEERING_DEPENDENCY" };
  if (task.workClass === "customer_interaction") {
    const [approval] = task.externalApprovalId
      ? await db
          .select()
          .from(approvals)
          .where(
            and(
              eq(approvals.companyId, companyId),
              eq(approvals.id, task.externalApprovalId),
              eq(approvals.status, "approved"),
            ),
          )
      : [];
    if (
      !approval ||
      approval.payload?.action !== "customer_interaction" ||
      !issue.id ||
      approval.payload?.issueId !== issue.id
    )
      return { runtime: null, blocker: "BLOCKED_ON_COMMERCIAL_APPROVAL" };
  }
  const runtime = resolveValidationRuntime(task);
  if (!runtime.runtime) return runtime;
  const [binding] = await db
    .select()
    .from(nodepadBindings)
    .where(eq(nodepadBindings.companyId, companyId));
  const gate = validationTaskGate(
    task,
    binding?.snapshot ?? null,
    programme?.policy ?? validationPolicySchema.parse({}),
  );
  return {
    runtime: gate.allowed ? runtime.runtime : null,
    blocker: gate.blocker,
  };
}
export async function assertValidationIssue(
  db: Db,
  companyId: string,
  issue: {
    id?: string;
    title: string;
    description?: string | null;
    assigneeAgentId?: string | null;
    validationTask?: ValidationTask | null;
  },
) {
  if (!issue.assigneeAgentId) return;
  const dispatch = await inspectValidationDispatch(
    db,
    companyId,
    issue,
    issue.assigneeAgentId,
  );
  if (dispatch?.blocker === "FOUNDER_ENGINEERING_DEPENDENCY") {
    const [programme] = await db
      .select()
      .from(validationProgrammes)
      .where(eq(validationProgrammes.companyId, companyId));
    if (programme) {
      const idempotencyKey = createHash("sha256")
        .update(
          JSON.stringify({ title: issue.title, task: issue.validationTask }),
        )
        .digest("hex");
      const [dependency] = await db
        .insert(validationRecords)
        .values({
          companyId,
          kind: "engineering_dependency",
          idempotencyKey,
          actorId: "validation-policy",
          phase: programme.phase,
          status: "founder_pending",
          payload: {
            kind: "FOUNDER_ENGINEERING_DEPENDENCY",
            requestedTitle: issue.title,
            hypothesisIds: issue.validationTask?.hypothesisIds ?? [],
            guidance:
              "Product engineering belongs to the founder outside Paperclip; continue useful validation without dispatching a backend worker",
          },
        })
        .onConflictDoNothing()
        .returning();
      if (dependency)
        await db.insert(activityLog).values({
          companyId,
          actorType: "system",
          actorId: "validation-policy",
          action: "validation.engineering_dependency",
          entityType: "validation_record",
          entityId: dependency.id,
          details: { directionIssueId: programme.directionIssueId },
        });
    }
  }
  if (dispatch?.blocker)
    throw unprocessable(dispatch.blocker, {
      resolution:
        dispatch.blocker === "FOUNDER_ENGINEERING_DEPENDENCY"
          ? "Hand engineering dependency to the founder; do not dispatch a backend engineer"
          : "Resolve the validation blocker before dispatch",
    });
}
