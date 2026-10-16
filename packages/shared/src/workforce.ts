import { z } from "zod";
import { VALIDATION_PHASES, validationTaskSchema } from "./validation.js";
export const WORKFORCE_STATES = [
  "DORMANT",
  "AVAILABLE",
  "ACTIVE",
  "WAITING",
  "BLOCKED",
  "PAUSED",
  "DISABLED",
] as const;
export const WORKFORCE_STAGES = [
  "collection",
  "analysis",
  "design",
  "frontend",
  "evaluation",
  "decision",
  "interview_preparation",
] as const;
export const WORKFORCE_GAPS = [
  "problem_existence",
  "problem_context",
  "customer_segment",
  "customer_language",
  "community_observation",
  "alternative_behavior",
  "current_solution",
  "trend_context",
  "assumption_mapping",
  "testable_hypothesis",
  "causal_mechanism",
  "counter_hypothesis",
  "opportunity_synthesis",
  "value_proposition",
  "positioning",
  "offer",
  "pricing_hypothesis",
  "customer_language_refinement",
  "experiment_design",
  "message_test",
  "pricing_test",
  "fake_door",
  "pretotype",
  "concierge_test",
  "channel_viability",
  "outbound_response",
  "community_activation",
  "content_response",
  "demand_generation",
  "evidence_quality",
  "demand_challenge",
  "wtp_challenge",
  "distribution_challenge",
  "experiment_interpretation",
  "red_team_review",
  "go_pivot_stop",
  "pivot_design",
  "kill_review",
  "portfolio_allocation",
  "founder_intelligence",
  "dataset_analysis",
  "campaign_asset",
  "visual",
  "demo",
] as const;
export const NODEPAD_READ_SCOPES = [
  "nodepad.context",
  "nodepad.hypotheses",
  "nodepad.evidence",
] as const;
export const NODEPAD_CANDIDATE_SCOPES = [
  "evidence_submission",
  "research_gap",
  "hypothesis_proposal",
  "counter_hypothesis",
  "experiment_spec",
  "experiment_result",
] as const;
const id = z.string().regex(/^[a-z][a-z0-9._-]*$/);
const strings = z.array(z.string().min(1).max(2000)).max(100);
export const workforceDefinitionSchema = z
  .object({
    version: z.literal("agency-workforce/v1"),
    importerVersion: z.literal("paperclip-agency/v1"),
    source: z
      .object({
        repository: z.literal("JsonLord/agency-agents"),
        branch: z.literal("validation-workforce"),
        commit: z.string().regex(/^[a-f0-9]{40}$/),
        license: z.string(),
      })
      .strict(),
    sourceAliases: z.record(z.string().regex(/^(agents|legacy-agents)\//)),
    divisions: z.array(id).min(1),
    skills: z.array(
      z
        .object({
          id,
          source: z.string(),
          version: z.string(),
          contentHash: z.string(),
          methodology: strings,
        })
        .strict(),
    ),
    providerCapabilities: z.array(
      z.object({ id, scope: z.string(), approval: z.string() }).strict(),
    ),
    capabilities: z.array(
      z
        .object({
          id,
          gaps: z.array(z.enum(WORKFORCE_GAPS)).min(1),
          agentIds: z.array(id).min(1),
        })
        .strict(),
    ),
    agents: z
      .array(
        z
          .object({
            agencyId: id,
            name: z.string().min(1),
            division: id,
            aliases: strings,
            sourcePath: z.string().regex(/^agents\/[a-z-]+\/[a-z-]+\.md$/),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            description: z.string(),
            skills: strings,
            sourceCapabilities: strings,
            capabilities: strings,
            nodepad: z
              .object({
                reads: z.array(z.enum(NODEPAD_READ_SCOPES)),
                writes: z.array(z.enum(NODEPAD_CANDIDATE_SCOPES)),
              })
              .strict(),
            activation: z
              .object({
                phases: z.array(z.enum(VALIDATION_PHASES)).min(1),
                stages: z.array(z.enum(WORKFORCE_STAGES)).min(1),
                defaultState: z.enum(["DORMANT", "AVAILABLE"]),
                scheduleSec: z.number().int().nonnegative(),
                collection: z.boolean(),
                independent: z.boolean(),
                productionOnly: z.boolean(),
              })
              .strict(),
            runtimeHints: z.record(z.string()),
            approval: z
              .object({
                externalWrite: z.literal("required"),
                leadDiscovery: z.literal("separate_founder_approval"),
                contact: z.literal("separate_founder_approval"),
              })
              .strict(),
            methodology: z
              .object({
                mission: z.string().max(4000),
                rules: strings,
                successCriteria: strings,
                handoffs: strings,
                normalizationNotes: strings,
              })
              .strict(),
          })
          .strict(),
      )
      .min(1),
    workflows: z.array(
      z
        .object({
          id,
          version: z.string(),
          objective: z.string(),
          inputs: z.record(z.unknown()),
          sourcePath: z.string(),
          contentHash: z.string(),
          steps: z.array(
            z
              .object({
                id: z.string(),
                agencyId: id,
                skills: strings,
                capabilities: strings,
                dependsOn: strings,
                expectedOutputs: strings,
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type ValidationWorkforceDefinition = z.infer<
  typeof workforceDefinitionSchema
>;
export type WorkforceAgentDefinition =
  ValidationWorkforceDefinition["agents"][number];
export type WorkforceState = (typeof WORKFORCE_STATES)[number];
export type WorkforceGap = (typeof WORKFORCE_GAPS)[number];
export type WorkforceStage = (typeof WORKFORCE_STAGES)[number];
export const workforceOverrideSchema = z
  .object({
    disabled: z.boolean().optional(),
    paused: z.boolean().optional(),
    runtimePreference: z
      .enum(["github-actions", "hermes_local", "jules"])
      .optional(),
    phases: z.array(z.enum(VALIDATION_PHASES)).optional(),
    restrictCapabilities: strings.optional(),
    requireFounderApproval: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.requireFounderApproval !== false,
    "Overrides cannot weaken approval requirements",
  );
export type WorkforceOverride = z.infer<typeof workforceOverrideSchema>;
export const workforceNeedSchema = z
  .object({
    eventKey: z.string().min(1).max(200),
    eventType: z.enum([
      "task_assignment",
      "research_gap",
      "primary_hypothesis",
      "evidence_arrived",
      "collection_completed",
      "experiment_completed",
      "analysis_completed",
      "blocker",
      "decision_request",
      "reporting_tick",
    ]),
    gap: z.string().min(1).max(100),
    stage: z.enum(WORKFORCE_STAGES),
    hypothesisId: z.string().min(1).max(500),
    sourceGapRef: z.string().min(1).max(500),
    agencyId: z
      .string()
      .regex(/^[a-z][a-z0-9._/-]*$/)
      .max(300)
      .optional(),
    datasetRefs: strings.default([]),
    reason: z.string().min(1).max(4000),
    stopCondition: z
      .string()
      .min(1)
      .max(2000)
      .default(
        "Stop when the named question is resolved, required evidence is missing, a blocker or handoff is recorded, the task is cancelled, or programme/CEO priority changes. Do not create follow-up work autonomously.",
      ),
    successCondition: z
      .string()
      .min(1)
      .max(2000)
      .default(
        "Return a traceable minimum-sufficient finding, preserving contradiction and uncertainty; artifact production alone is not evidence or validation.",
      ),
    validationTask: validationTaskSchema,
    economics: z
      .object({
        informationGain: z.number().min(0).max(1),
        timeToSignalHours: z.number().nonnegative(),
        cashCostCents: z.number().int().nonnegative(),
        founderMinutes: z.number().nonnegative(),
        julesStarts: z.number().int().nonnegative(),
        externalInteractionBurden: z.string().max(1000),
      })
      .strict(),
  })
  .strict();
export type WorkforceNeed = z.infer<typeof workforceNeedSchema>;
