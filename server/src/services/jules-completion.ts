import { and, eq, sql } from "drizzle-orm";
import {
  activityLog,
  companyJulesSources,
  heartbeatRuns,
  issues,
  issueWorkProducts,
  julesSessions,
  type Db,
} from "@paperclipai/db";
/** Existing native durable watcher owns completion. No second watcher or acceptance. */
export async function registerJulesCompletion(db: Db, sessionId: string) {
  return db.transaction(async (tx) => {
    // Session lock serializes multiple reconcilers; issue lock also serializes the initial heartbeat insertion.
    await tx.execute(
      sql`select id from jules_sessions where id = ${sessionId} for update`,
    );
    const session = await tx
      .select()
      .from(julesSessions)
      .where(eq(julesSessions.id, sessionId))
      .then((r) => r[0]);
    if (
      !session ||
      session.status !== "COMPLETED_UNVALIDATED" ||
      !session.issueId ||
      !session.pullRequestUrl
    )
      return null;
    await tx.execute(
      sql`select id from issues where id = ${session.issueId} for update`,
    );
    const [issue, source, run] = await Promise.all([
      tx
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.id, session.issueId),
            eq(issues.companyId, session.companyId),
          ),
        )
        .then((r) => r[0]),
      tx
        .select()
        .from(companyJulesSources)
        .where(
          and(
            eq(companyJulesSources.id, session.companySourceId),
            eq(companyJulesSources.companyId, session.companyId),
          ),
        )
        .then((r) => r[0]),
      tx
        .select()
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.id, session.paperclipRunId),
            eq(heartbeatRuns.companyId, session.companyId),
            eq(heartbeatRuns.agentId, session.agentId),
          ),
        )
        .then((r) => r[0]),
    ]);
    if (!issue || !source || !run)
      throw new Error(
        "Jules completion has an invalid company/run/issue/source binding",
      );
    const url = new URL(session.pullRequestUrl);
    const match = /^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)\/?$/.exec(
      url.pathname,
    );
    if (
      url.protocol !== "https:" ||
      url.host !== "github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !match ||
      `${match[1]}/${match[2]}`.toLowerCase() !==
        source.repository.toLowerCase()
    )
      throw new Error("Jules PR repository is outside the company source");
    const externalId = `${match[1]}/${match[2]}#${match[3]}`;
    const metadata = {
      provider: "jules",
      remoteSessionId: session.julesSessionId,
      paperclipRunId: session.paperclipRunId,
      agentId: session.agentId,
      issueId: session.issueId,
      companySourceId: session.companySourceId,
      repository: source.repository,
      startingBranch: source.startingBranch,
      pullRequestUrl: session.pullRequestUrl,
      pullRequestHeadSha: session.resultJson?.pullRequestHeadSha ?? null,
      completionCandidate: true,
      accepted: false,
      validation: {
        verdict: "REVIEW_REQUIRED",
        findings: ["ARTIFACT_VALIDATION_PENDING"],
      },
    };
    let product = await tx
      .select()
      .from(issueWorkProducts)
      .where(
        and(
          eq(issueWorkProducts.companyId, session.companyId),
          eq(issueWorkProducts.issueId, session.issueId),
          eq(issueWorkProducts.provider, "github"),
          eq(issueWorkProducts.externalId, externalId),
        ),
      )
      .then((r) => r[0]);
    if (product && product.createdByRunId !== session.paperclipRunId)
      throw new Error("PR is already bound to a different native run");
    if (!product)
      [product] = await tx
        .insert(issueWorkProducts)
        .values({
          companyId: session.companyId,
          projectId: session.projectId,
          issueId: session.issueId,
          type: "pull_request",
          provider: "github",
          externalId,
          title: session.pullRequestTitle ?? `Jules PR #${match[3]}`,
          url: session.pullRequestUrl,
          status: "ready_for_review",
          reviewState: "needs_board_review",
          isPrimary: false,
          createdByRunId: session.paperclipRunId,
          metadata,
        })
        .returning();
    if (session.resultJson?.workProductRegistered !== true) {
      if (
        !["done", "cancelled", "in_review"].includes(issue.status) &&
        (!issue.executionRunId ||
          issue.executionRunId === session.paperclipRunId)
      ) {
        await tx
          .update(issues)
          .set({ status: "in_review", updatedAt: new Date() })
          .where(eq(issues.id, issue.id));
      }
      await tx
        .insert(activityLog)
        .values({
          companyId: session.companyId,
          actorType: "system",
          actorId: "jules-reconciler",
          action: "jules.completion.work_product_registered",
          entityType: "issue_work_product",
          entityId: product.id,
          details: metadata,
        });
      await tx
        .update(julesSessions)
        .set({
          resultJson: {
            ...session.resultJson,
            workProductRegistered: true,
            workProductId: product.id,
          },
          updatedAt: new Date(),
        })
        .where(eq(julesSessions.id, session.id));
    }
    return product;
  });
}
