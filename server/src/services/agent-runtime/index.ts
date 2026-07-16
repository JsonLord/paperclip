import type { Db } from "@paperclipai/db";
import { sessionResolverService } from "./session-resolver.js";
import { memoryLoaderService } from "./memory-loader.js";
import { mcpResolverService } from "./mcp-resolver.js";
import { skillResolverService, type SkillSnapshot } from "./skill-resolver.js";
import { postRunEvalService } from "./post-run-eval.js";
import { kpiAnalyticsService } from "./kpi-analytics.js";

export interface AgentRunContext {
  agentId: string;
  companyId: string;
  adapterType: string;
  projectId?: string | null;
  runId?: string | null;
  desiredSkills?: string[];
}

export interface AgentRunResult {
  taskCompleted?: boolean;
  selfAssessmentScore?: number;
  tokensUsed?: number;
  costCents?: number;
  durationSeconds?: number;
  errorsEncountered?: number;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  sessionParams?: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
}

export function agentRuntimeService(db: Db) {
  const sessions = sessionResolverService(db);
  const memory = memoryLoaderService(db);
  const mcp = mcpResolverService(db);
  const skills = skillResolverService(db);
  const postRun = postRunEvalService(db);
  const analytics = kpiAnalyticsService(db);

  return {
    sessions,
    memory,
    mcp,
    skills,
    postRun,
    analytics,

    async execute(
      context: AgentRunContext,
      adapterExecute: (enhancedContext: {
        session: Awaited<ReturnType<typeof sessions.resolveSession>>;
        memories: Awaited<ReturnType<typeof memory.loadMemories>>;
        mcpServers: Awaited<ReturnType<typeof mcp.resolveMcpConfig>>;
        skillSnapshots: SkillSnapshot[];
      }) => Promise<AgentRunResult>,
    ) {
      // --- Pre-run ---

      // 1. Resolve session (project-based)
      const session = await sessions.resolveSession(
        context.agentId,
        context.adapterType,
        context.projectId ?? null,
      );

      // 2. Load memory (global + project-scoped)
      const memories = await memory.loadMemories(context.agentId, context.projectId);

      // 3. Resolve MCP config
      const mcpServers = await mcp.resolveMcpConfig(context.agentId, context.companyId);

      // 4. Resolve skills
      const skillSnapshots = await skills.resolveSkills(
        context.agentId,
        context.companyId,
        context.desiredSkills,
      );

      // --- Execute adapter ---
      const result = await adapterExecute({
        session,
        memories,
        mcpServers,
        skillSnapshots,
      });

      // --- Post-run ---

      // 1. Record KPIs
      await postRun.recordKpis({
        agentId: context.agentId,
        companyId: context.companyId,
        projectId: context.projectId ?? null,
        runId: context.runId ?? null,
        taskCompleted: result.taskCompleted ?? null,
        selfAssessmentScore: result.selfAssessmentScore ?? null,
        tokensUsed: result.tokensUsed ?? null,
        costCents: result.costCents ?? null,
        durationSeconds: result.durationSeconds ?? null,
        errorsEncountered: result.errorsEncountered ?? 0,
        metadata: result.metadata ?? {},
      });

      // 2. Detect skill changes (re-resolve skills and compare)
      const afterSkillSnapshots = await skills.resolveSkills(
        context.agentId,
        context.companyId,
        context.desiredSkills,
      );
      const skillChanges = await skills.detectSkillChanges(
        skillSnapshots,
        afterSkillSnapshots,
        context.agentId,
        context.companyId,
        context.runId,
      );

      // 3. Update session state
      if (session) {
        await sessions.updateSession(
          session.agentId,
          session.adapterType,
          session.projectId ?? null,
          {
            lastRunId: context.runId ?? null,
            runCount: 1,
            inputTokens: result.inputTokens ?? 0,
            outputTokens: result.outputTokens ?? 0,
          },
        );
      }

      return {
        ...result,
        sessionId: session?.id ?? null,
        skillChanges,
      };
    },
  };
}

// Re-export sub-services for direct use
export { sessionResolverService } from "./session-resolver.js";
export { memoryLoaderService } from "./memory-loader.js";
export { mcpResolverService } from "./mcp-resolver.js";
export { skillResolverService } from "./skill-resolver.js";
export { postRunEvalService } from "./post-run-eval.js";
export { kpiAnalyticsService } from "./kpi-analytics.js";
