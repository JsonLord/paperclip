import { and, eq, inArray, sql } from "drizzle-orm";
import {
  activityLog,
  companyRepositoryBindings,
  githubActionRuns,
  heartbeatRuns,
  issueWorkProducts,
  agents,
  type Db,
} from "@paperclipai/db";
import { z } from "zod";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { secretService } from "../secrets.js";
import { conflict } from "../../errors.js";

export const actionsConfigSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  workflow: z.string().regex(/^[\w.-]+\.ya?ml$/),
  ref: z.string().min(1).max(200),
  githubSecretRef: z.string().uuid(),
  workforcePacketInput: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .optional(),
  inputs: z
    .record(z.union([z.string().max(4000), z.boolean(), z.number().finite()]))
    .default({}),
});
export interface ActionRemoteRun {
  id: number;
  display_title: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch?: string;
}
export interface ActionArtifact {
  id: number;
  name: string;
  archive_download_url: string;
  expired?: boolean;
}
export interface ActionsProvider {
  dispatch(
    repository: string,
    workflow: string,
    ref: string,
    inputs: Record<string, string | number | boolean>,
    token: string,
  ): Promise<void>;
  find(
    repository: string,
    workflow: string,
    correlation: string,
    token: string,
  ): Promise<ActionRemoteRun | null>;
  get(repository: string, id: string, token: string): Promise<ActionRemoteRun>;
  artifacts(
    repository: string,
    id: string,
    token: string,
  ): Promise<ActionArtifact[]>;
  download(
    repository: string,
    artifactId: number,
    token: string,
  ): Promise<ArrayBuffer>;
}
export function githubActionsProvider(
  fetcher: typeof fetch = fetch,
): ActionsProvider {
  async function request(path: string, token: string, init: RequestInit = {}) {
    const response = await fetcher(`https://api.github.com/repos/${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok)
      throw new Error(`GitHub Actions request failed (${response.status})`);
    return response;
  }
  return {
    dispatch: async (repo, workflow, ref, inputs, token) => {
      await request(
        `${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
        token,
        { method: "POST", body: JSON.stringify({ ref, inputs }) },
      );
    },
    find: async (repo, workflow, correlation, token) => {
      const response = await request(
        `${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&per_page=100`,
        token,
      );
      const data = (await response.json()) as {
        workflow_runs: ActionRemoteRun[];
      };
      const matches = data.workflow_runs.filter(
        (r) => r.display_title === correlation,
      );
      if (matches.length > 1)
        throw new Error(
          "Ambiguous GitHub run correlation; manual reconciliation required",
        );
      return matches[0] ?? null;
    },
    get: async (repo, id, token) =>
      (
        await request(`${repo}/actions/runs/${encodeURIComponent(id)}`, token)
      ).json(),
    artifacts: async (repo, id, token) => {
      const all: ActionArtifact[] = [];
      for (let page = 1; page <= 100; page++) {
        const data = (await (
          await request(
            `${repo}/actions/runs/${encodeURIComponent(id)}/artifacts?per_page=100&page=${page}`,
            token,
          )
        ).json()) as { artifacts: ActionArtifact[] };
        all.push(...data.artifacts);
        if (data.artifacts.length < 100) return all;
      }
      throw new Error("Artifact pagination exceeded safe bound");
    },
    download: async (repo, id, token) =>
      (
        await request(`${repo}/actions/artifacts/${id}/zip`, token)
      ).arrayBuffer(),
  };
}
export function normalizeActionsResult(remote: ActionRemoteRun) {
  return {
    externalRunId: String(remote.id),
    status: remote.status === "completed" ? "completed" : "running",
    conclusion: remote.conclusion,
    succeeded: remote.status === "completed" && remote.conclusion === "success",
    url: remote.html_url,
  };
}
export function githubActionsService(
  db: Db,
  provider = githubActionsProvider(),
  resolveSecret = (companyId: string, ref: string) =>
    secretService(db).resolveSecretValue(companyId, ref, "latest"),
) {
  async function configFor(ctx: AdapterExecutionContext) {
    const config = actionsConfigSchema.parse(ctx.config);
    const binding = await db
      .select()
      .from(companyRepositoryBindings)
      .where(
        and(
          eq(companyRepositoryBindings.companyId, ctx.agent.companyId),
          eq(companyRepositoryBindings.active, true),
        ),
      )
      .then((r) => r[0]);
    if (!binding || binding.repository !== config.repository)
      throw conflict(
        "Actions repository is not the company's bound artifact repository",
      );
    return config;
  }
  async function execute(
    ctx: AdapterExecutionContext,
  ): Promise<AdapterExecutionResult> {
    const config = await configFor(ctx);
    if (ctx.context.workforcePacket && !config.workforcePacketInput)
      throw conflict(
        "READY_CONFIG: Actions workflow must declare an input for the typed workforce packet",
      );
    const packetInputs =
      ctx.context.workforcePacket && config.workforcePacketInput
        ? {
            [config.workforcePacketInput]: JSON.stringify(
              ctx.context.workforcePacket,
            ),
          }
        : {};
    if (Object.values(packetInputs).some((v) => v.length > 48000))
      throw conflict("Workforce packet exceeds workflow input bound");
    const token = await resolveSecret(
      ctx.agent.companyId,
      config.githubSecretRef,
    );
    const row = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`actions:${ctx.runId}`}))`,
      );
      const prior = await tx
        .select()
        .from(githubActionRuns)
        .where(eq(githubActionRuns.paperclipRunId, ctx.runId))
        .then((r) => r[0]);
      if (prior) return prior;
      return tx
        .insert(githubActionRuns)
        .values({
          companyId: ctx.agent.companyId,
          paperclipRunId: ctx.runId,
          issueId:
            typeof ctx.context.issueId === "string"
              ? ctx.context.issueId
              : null,
          repository: config.repository,
          workflow: config.workflow,
          ref: config.ref,
          credentialSecretRef: config.githubSecretRef,
          status: "prepared",
        })
        .returning()
        .then((r) => r[0]);
    });
    // Claim once before external dispatch. Ambiguous network failures must be reconciled, never redispatched blindly.
    const claimed = await db
      .update(githubActionRuns)
      .set({
        status: "dispatching",
        dispatchedAt: new Date(),
        attempts: 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(githubActionRuns.id, row.id),
          eq(githubActionRuns.status, "prepared"),
        ),
      )
      .returning();
    if (claimed.length) {
      try {
        await provider.dispatch(
          config.repository,
          config.workflow,
          config.ref,
          { ...config.inputs, ...packetInputs, paperclip_run_id: ctx.runId },
          token,
        );
        await db.insert(activityLog).values({
          companyId: row.companyId,
          actorType: "system",
          actorId: "github-actions",
          action: "validation.actions.dispatched",
          entityType: "heartbeat_run",
          entityId: ctx.runId,
          details: {
            actionsRunId: row.id,
            repository: row.repository,
            workflow: row.workflow,
          },
        });
      } catch {
        await db
          .update(githubActionRuns)
          .set({ status: "dispatch_unknown", updatedAt: new Date() })
          .where(eq(githubActionRuns.id, row.id));
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorCode: "actions_dispatch_unknown",
          errorMessage:
            "Dispatch response was not confirmed; reconcile before retrying",
          resultJson: { actionsRunId: row.id, accepted: false, pending: true },
        };
      }
    }
    await reconcile(row.id);
    const updated = await db
      .select()
      .from(githubActionRuns)
      .where(eq(githubActionRuns.id, row.id))
      .then((r) => r[0]);
    return {
      exitCode:
        updated.status === "completed" && updated.conclusion !== "success"
          ? 1
          : 0,
      signal: null,
      timedOut: false,
      provider: "github-actions",
      summary:
        updated.status === "completed"
          ? `Workflow concluded: ${updated.conclusion}`
          : "Workflow dispatch recorded; external result is pending",
      resultJson: {
        actionsRunId: row.id,
        externalRunId: updated.externalRunId,
        pending: updated.status !== "completed",
        accepted: false,
        workflowSucceeded:
          updated.status === "completed" && updated.conclusion === "success",
      },
    };
  }
  async function reconcile(id: string) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`actions-reconcile:${id}`}))`,
      );
      const [row] = await tx
        .select()
        .from(githubActionRuns)
        .where(eq(githubActionRuns.id, id));
      if (!row || row.status === "completed") return row;
      const token = await resolveSecret(row.companyId, row.credentialSecretRef);
      const remote = row.externalRunId
        ? await provider.get(row.repository, row.externalRunId, token)
        : await provider.find(
            row.repository,
            row.workflow,
            `paperclip:${row.paperclipRunId}`,
            token,
          );
      if (!remote) return row;
      if (
        remote.display_title !== `paperclip:${row.paperclipRunId}` ||
        (row.externalRunId && String(remote.id) !== row.externalRunId)
      )
        throw conflict("Actions response failed run correlation");
      const normalized = normalizeActionsResult(remote);
      const artifacts =
        normalized.status === "completed"
          ? (
              await provider.artifacts(
                row.repository,
                normalized.externalRunId,
                token,
              )
            )
              .filter((a) => !a.expired)
              .map((a) => ({
                id: a.id,
                name: a.name,
                url: a.archive_download_url,
              }))
          : [];
      const [updated] = await tx
        .update(githubActionRuns)
        .set({
          externalRunId: normalized.externalRunId,
          status: normalized.status,
          conclusion: normalized.conclusion,
          artifacts,
          updatedAt: new Date(),
        })
        .where(eq(githubActionRuns.id, id))
        .returning();
      if (normalized.status === "completed") {
        for (const artifact of artifacts)
          if (row.issueId)
            await tx.insert(issueWorkProducts).values({
              companyId: row.companyId,
              issueId: row.issueId,
              type: "artifact",
              provider: "github-actions",
              externalId: `${normalized.externalRunId}:${artifact.id}`,
              title: artifact.name,
              url: artifact.url,
              status: "candidate",
              reviewState: "pending",
              createdByRunId: row.paperclipRunId,
              metadata: { conclusion: remote.conclusion, accepted: false },
            });
        await tx
          .update(heartbeatRuns)
          .set({
            resultJson: {
              actionsRunId: row.id,
              externalRunId: normalized.externalRunId,
              remoteConclusion: remote.conclusion,
              pending: false,
              accepted: false,
            },
            updatedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, row.paperclipRunId));
        await tx.insert(activityLog).values({
          companyId: row.companyId,
          actorType: "system",
          actorId: "github-actions",
          action: "validation.actions.completed",
          entityType: "heartbeat_run",
          entityId: row.paperclipRunId,
          details: {
            actionsRunId: row.id,
            conclusion: remote.conclusion,
            artifacts: artifacts.length,
            cost: "unreported",
          },
        });
      }
      return updated;
    });
  }
  async function retrieveArtifact(
    companyId: string,
    id: string,
    artifactId: number,
  ) {
    const [row] = await db
      .select()
      .from(githubActionRuns)
      .where(
        and(
          eq(githubActionRuns.id, id),
          eq(githubActionRuns.companyId, companyId),
        ),
      );
    if (!row || !row.artifacts.some((a) => a.id === artifactId))
      throw conflict("Artifact is not in the company's reconciled run");
    return provider.download(
      row.repository,
      artifactId,
      await resolveSecret(companyId, row.credentialSecretRef),
    );
  }
  return { execute, reconcile, retrieveArtifact };
}
export function createGithubActionsAdapter(db: Db): ServerAdapterModule {
  return {
    type: "github-actions",
    execute: githubActionsService(db).execute,
    supportsLocalAgentJwt: false,
    models: [],
    testEnvironment: async (ctx) => ({
      adapterType: "github-actions",
      status: actionsConfigSchema.safeParse(ctx.config).success
        ? "warn"
        : "fail",
      checks: [
        {
          code: "READY_CONFIG",
          level: "warn",
          message:
            "Requires a company-bound repository, company-scoped secret and a workflow honoring run correlation; live access is not tested here",
        },
      ],
      testedAt: new Date().toISOString(),
    }),
  };
}

/** Restart-safe polling. An ambiguous dispatch is looked up, never repeated automatically. */
export function startGithubActionsReconciler(db: Db) {
  let running = false;
  const service = githubActionsService(db);
  async function tick() {
    if (running) return;
    running = true;
    try {
      const rows = await db
        .select()
        .from(githubActionRuns)
        .where(
          inArray(githubActionRuns.status, [
            "dispatching",
            "dispatch_unknown",
            "running",
          ]),
        );
      for (const row of rows) {
        try {
          await service.reconcile(row.id);
        } catch {
          /* Retry read-only reconciliation next tick; never redispatch on error. */
        }
      }
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, 30_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
