import { and, eq } from "drizzle-orm";
import {
  workforceActivations,
  workforceMembers,
  type Db,
} from "@paperclipai/db";
/** A terminal native issue stops execution; it never counts as evidence or a completed specialist finding. */
export async function stopWorkforceIssue(
  db: Db,
  companyId: string,
  issueId: string,
  status: string,
) {
  const rows = await db
    .select()
    .from(workforceActivations)
    .where(
      and(
        eq(workforceActivations.companyId, companyId),
        eq(workforceActivations.issueId, issueId),
        eq(workforceActivations.status, "ACTIVE"),
      ),
    );
  for (const a of rows) {
    const cancelled = status === "cancelled";
    await db
      .update(workforceActivations)
      .set({
        status: cancelled
          ? "CANCELLED"
          : status === "blocked"
            ? "BLOCKED"
            : "AWAITING_RESULT",
        finishedAt: cancelled ? new Date() : null,
      })
      .where(eq(workforceActivations.id, a.id));
    await db
      .update(workforceMembers)
      .set({
        state: cancelled
          ? "DORMANT"
          : status === "blocked"
            ? "BLOCKED"
            : "WAITING",
        updatedAt: new Date(),
      })
      .where(eq(workforceMembers.id, a.memberId));
  }
}
