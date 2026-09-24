import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { asBoolean, asNumber, asString, renderTemplate } from "@paperclipai/adapter-utils/server-utils";
import { extractPullRequest, JulesApiClient, type JulesRemoteSession } from "./api.js";
import { createJulesSessionSpec, JULES_OUTCOME_TEMPLATES, renderJulesPrompt, type JulesSessionSpec } from "../prompts.js";

const TERMINAL = new Set(["FAILED", "COMPLETED", "CANCELLED"]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const stateOf = (session: JulesRemoteSession) => String(session.state ?? session.status ?? "QUEUED").toUpperCase();

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const env = ctx.config.env && typeof ctx.config.env === "object" ? ctx.config.env as Record<string, unknown> : {};
  const apiKey = asString(env.JULES_API_KEY, asString(ctx.config.apiKey, "")).trim();
  const source = asString(ctx.config.source, "").trim();
  const repository = asString(ctx.config.repository, "").trim();
  if (!apiKey || !source || !repository) return { exitCode: 1, signal: null, timedOut: false, errorMessage: "Jules requires apiKey, source, and repository" };
  const baseUrl = asString(ctx.config.apiBaseUrl, "https://jules.googleapis.com/v1alpha");
  const startingBranch = asString(ctx.config.startingBranch, "main");
  const templateId = asString(ctx.config.outcomeTemplate, "").trim() as keyof typeof JULES_OUTCOME_TEMPLATES;
  const outcomeTemplate = JULES_OUTCOME_TEMPLATES[templateId];
  const goalSupport = ctx.context.goalSupport && typeof ctx.context.goalSupport === "object" ? ctx.context.goalSupport as Record<string, unknown> : {};
  const supportPacks = (Array.isArray(goalSupport.packs) ? goalSupport.packs.filter((pack) => Boolean(pack) && typeof pack === "object") : []) as NonNullable<JulesSessionSpec["support"]>["packs"];
  const supportStrings = (key: string): string[] => Array.isArray(goalSupport[key]) ? (goalSupport[key] as unknown[]).filter((value): value is string => typeof value === "string") : [];
  const missingRequiredPacks = supportStrings("missingRequiredPacks");
  if (missingRequiredPacks.length > 0) {
    return { exitCode: 1, signal: null, timedOut: false, errorCode: "jules_required_support_missing", errorMessage: `Required goal support is unavailable: ${missingRequiredPacks.join(", ")}`, resultJson: { missingRequiredPacks, completionCandidate: false, accepted: false } };
  }
  const unique = (...groups: string[][]): string[] => [...new Set(groups.flat())];
  // Every FounderOS worker is configured with one outcome template for its whole life, so
  // the template says what kind of work the role does and nothing about which issue woke
  // it. Jules runs on Google's infrastructure with no Paperclip credential, so it cannot
  // look the issue up either: unless the assignment travels in the prompt, the worker
  // receives the template's generic objective for every task it is ever given.
  const assignmentRaw = ctx.context.assignment && typeof ctx.context.assignment === "object"
    ? ctx.context.assignment as Record<string, unknown>
    : null;
  const assignmentTitle = asString(assignmentRaw?.title, "").trim();
  const assignment = assignmentTitle
    ? {
        title: assignmentTitle,
        description: asString(assignmentRaw?.description, "").trim() || undefined,
        priority: asString(assignmentRaw?.priority, "").trim() || undefined,
        goal: asString(assignmentRaw?.goal, "").trim() || undefined,
      }
    : undefined;
  const generatedSpec = outcomeTemplate ? createJulesSessionSpec({
    company: { id: ctx.agent.companyId, name: asString(ctx.config.companyName, "Company"), repository },
    paperclip: { runId: ctx.runId, agentId: ctx.agent.id, projectId: asString(ctx.context.projectId, "") || undefined, goalId: asString(ctx.context.goalId, "") || undefined, outcomeId: asString(ctx.context.issueId, asString(ctx.context.taskId, "")) || undefined },
    role: outcomeTemplate.role, execution: { source, startingBranch, requirePlanApproval: !asBoolean(ctx.config.autoApprovePlan, false) },
    capabilities: unique([...outcomeTemplate.capabilities], supportStrings("capabilities")), writeScope: [...outcomeTemplate.writeScope], linear: { mode: "NONE" },
    objective: asString(ctx.config.objective, outcomeTemplate.objective), inputs: unique(Array.isArray(ctx.config.inputs) ? ctx.config.inputs.filter((item): item is string => typeof item === "string") : [], supportStrings("inputPaths")),
    requiredOutputs: unique([...outcomeTemplate.requiredOutputs], supportStrings("outputPaths")), acceptanceCriteria: unique([...outcomeTemplate.acceptanceCriteria], supportStrings("acceptanceCriteria")), cannotCompleteIf: unique([...outcomeTemplate.cannotCompleteIf], supportStrings("cannotCompleteIf")),
    externalActions: "APPROVAL_REQUIRED", assignment, managerNotes: asString(ctx.config.managerNotes, ""),
    support: {
      skills: supportStrings("skills"),
      packs: supportPacks,
      missingRequiredPacks,
    },
  }) : null;
  const prompt = ctx.config.sessionSpec && typeof ctx.config.sessionSpec === "object"
    ? renderJulesPrompt(ctx.config.sessionSpec as JulesSessionSpec)
    : generatedSpec
      ? renderJulesPrompt(generatedSpec)
    : renderTemplate(asString(ctx.config.promptTemplate, "Complete the assigned Paperclip outcome. Run: {{runId}}"), { runId: ctx.runId, agentId: ctx.agent.id, companyId: ctx.agent.companyId, context: ctx.context });
  const configuredSpec = ctx.config.sessionSpec && typeof ctx.config.sessionSpec === "object"
    ? ctx.config.sessionSpec as Partial<JulesSessionSpec>
    : generatedSpec;
  const requirePlanApproval = configuredSpec?.execution?.requirePlanApproval
    ?? !asBoolean(ctx.config.autoApprovePlan, false);
  await ctx.onMeta?.({ adapterType: "jules", command: "Jules REST API", commandNotes: [`repository=${repository}`, `source=${source}`], prompt });
  const api = new JulesApiClient(baseUrl, apiKey);
  let session: JulesRemoteSession;
  const existingId = asString(ctx.runtime.sessionParams?.julesSessionId, "").trim();
  if (existingId) session = await api.getSession(existingId);
  else {
    session = await api.createSession({
      prompt,
      source,
      startingBranch,
      requirePlanApproval,
      title: assignmentTitle || outcomeTemplate?.title || (asString(ctx.config.title, "") || undefined),
    });
    if (!session.id) throw new Error("Jules create-session response did not contain an id");
    await ctx.onMeta?.({ adapterType: "jules", command: "Jules session created", context: { julesSession: { id: session.id, profileId: asString(ctx.config.profileId, ""), companySourceId: asString(ctx.config.companySourceId, ""), repository, source, startingBranch } } });
    await ctx.onLog("stdout", `[jules] created remote session ${session.id}\n`);
  }
  const pollMs = Math.max(1000, asNumber(ctx.config.pollIntervalSec, 5) * 1000);
  const deadline = Date.now() + Math.max(0, asNumber(ctx.config.maxWaitSec, 30) * 1000);
  while (!TERMINAL.has(stateOf(session)) && Date.now() < deadline) {
    if (stateOf(session) === "AWAITING_PLAN_APPROVAL" && asBoolean(ctx.config.autoApprovePlan, false) && !requirePlanApproval) {
      await api.approvePlan(session.id);
    }
    await sleep(pollMs);
    session = await api.getSession(session.id);
    await ctx.onLog("stdout", `[jules] ${session.id} ${stateOf(session)}\n`);
  }
  const state = stateOf(session);
  const completed = state === "COMPLETED";
  const pullRequest = extractPullRequest(session);
  const activities = await api.listActivities(session.id).catch(() => ({ items: [] }));
  const lastActivity = activities.items.at(-1);
  return {
    exitCode: state === "FAILED" ? 1 : 0, signal: null, timedOut: false,
    sessionParams: { julesSessionId: session.id, repository, source, startingBranch }, sessionDisplayId: session.id,
    summary: completed ? "Jules completed remote execution; validation is required before acceptance." : `Jules remote session is ${state}.`,
    resultJson: {
      julesSessionId: session.id,
      state,
      repository,
      pullRequestUrl: pullRequest?.url ?? null,
      pullRequestTitle: pullRequest?.title ?? null,
      pullRequestDescription: pullRequest?.description ?? null,
      lastActivityId: lastActivity?.id ?? lastActivity?.name ?? null,
      remoteUpdatedAt: session.updateTime ?? null,
      remoteActive: !TERMINAL.has(state),
      completionCandidate: completed,
      accepted: false,
    },
    errorMessage: state === "FAILED" ? "Jules remote session failed" : null,
  };
}
