import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activationDefinitions, activityLog, artifactStaleness, commercialCommitments,
  companyDeployments, customerCostObservations, customerOutcomes, issues, marketWaits,
  productUsageEvents, retentionEvents, retentionWindows, salesInteractions, salesProspects,
  valueHypotheses,
} from "@paperclipai/db";
import { founderosContentService, type GoalTemplate, type SystemDefinition } from "./founderos-content/index.js";
import { mvpReliabilityService } from "./mvp-reliability.js";

export const PRODUCT_EVENT_TYPES = ["ACCOUNT_CREATED", "SIGNED_IN", "ONBOARDING_STARTED", "ONBOARDING_COMPLETED", "CORE_WORKFLOW_STARTED", "CORE_WORKFLOW_COMPLETED", "OUTPUT_GENERATED", "OUTPUT_VIEWED", "OUTPUT_EXPORTED", "FEATURE_USED", "RETURN_SESSION", "ERROR_ENCOUNTERED", "SUPPORT_REQUESTED"] as const;
export const EVENT_ENVIRONMENTS = ["PRODUCTION", "TEST", "SYNTHETIC", "INTERNAL"] as const;
export const VALUE_EVIDENCE_CLASSES = ["PRODUCT_BEHAVIOR", "CUSTOMER_REPORTED_OUTCOME", "OBSERVED_OPERATIONAL_OUTCOME", "MEASURED_TIME_SAVING", "MEASURED_COST_SAVING", "COMMERCIAL_EXPANSION", "REPEAT_USAGE", "ASSUMPTION", "SYNTHETIC"] as const;
export const RETENTION_MODELS = ["RECURRING_SUBSCRIPTION", "REPEATED_USAGE", "REPEAT_PURCHASE", "PROJECT_RENEWAL", "PAID_EXTENSION", "EXPANSION", "REFERRAL", "ONGOING_WORKFLOW", "ONE_OFF_WITH_REFERRAL"] as const;
export const RETENTION_SIGNALS = ["RETURN_SESSION", "REPEAT_PURCHASE", "RENEWAL", "EXPANSION", "REFERRAL", "CANCELLATION", "CHURN"] as const;
export const CHURN_REASONS = ["NO_VALUE_REALIZED", "PRODUCT_FAILURE", "PRICE", "MISSING_FUNCTIONALITY", "LOW_FREQUENCY_NEED", "SWITCHED_TO_ALTERNATIVE", "PROCUREMENT", "BUDGET", "ORGANIZATIONAL_CHANGE", "IMPLEMENTATION_FRICTION", "UNKNOWN"] as const;
export const COST_PROVENANCE = ["MEASURED", "ALLOCATED", "ESTIMATED", "UNKNOWN"] as const;
export const USAGE_DECISIONS = ["USAGE_CONFIRMED", "IMPROVE_ACTIVATION", "INSUFFICIENT_USAGE", "PRODUCT_BLOCKER", "REFINE_ICP"] as const;
export const VALUE_DECISIONS = ["VALUE_SUPPORTED", "REFINE_VALUE_PROPOSITION", "IMPROVE_PRODUCT_WORKFLOW", "GATHER_MORE_VALUE_EVIDENCE", "VALUE_NOT_SUPPORTED"] as const;
export const RETENTION_DECISIONS = ["RETENTION_SUPPORTED", "IMPROVE_RETENTION", "REFINE_OFFER", "REFINE_PRICE", "REFINE_ICP", "WAIT_FOR_MORE_RETENTION", "CHURN_RISK", "RETENTION_NOT_SUPPORTED"] as const;

export const customerValueSystem: SystemDefinition = {
  id: "customer-value", version: "1.1.0", title: "Customer Value & Retention",
  purpose: "Connect commercial commitment to real production usage, customer outcomes, retention or churn, and source-backed customer-level economic observations.",
  stateDependencies: ["validated commercial commitment", "registered runtime"],
  goals: ["observe-product-usage", "validate-value-realization", "validate-retention"],
  expectedOutputs: ["product/USAGE_REPORT.md", "product/ACTIVATION_FUNNEL.md", "product/VALUE_REALIZATION_REPORT.md", "product/RETENTION_REPORT.md", "product/CHURN_EVIDENCE.md", "business-case/ECONOMIC_OBSERVATIONS.md", "evidence/CLAIM_EVIDENCE_LEDGER.md", "evidence/ASSUMPTION_REGISTER.md", "firm/**"],
  wakeConditions: ["RETURN_SESSION", "REPEAT_PURCHASE", "RENEWAL", "EXPANSION", "REFERRAL", "CANCELLATION", "CHURN", "retention_window_expired", "customer_interaction", "operator_resumed"],
  evidenceFeedbackLoop: ["commitment -> production use -> activation -> outcome -> retention/churn -> economic observation"], stopConditions: ["structured retention decision", "operator stop"],
};
const common: Pick<GoalTemplate, "system" | "requiredSkills" | "supportPacks" | "requiredCapabilities" | "externalActionPolicy" | "wakeConditions" | "firm"> = { system: "customer-value", requiredSkills: ["goal-contract-execution", "bpw-evidence-and-source-discipline"], supportPacks: [{ id: "core.evidence-discipline", version: "1.0.0", required: true }], requiredCapabilities: ["firm"], externalActionPolicy: "APPROVAL_REQUIRED", wakeConditions: customerValueSystem.wakeConditions, firm: { required: true, buildBefore: true, buildAfter: true } };
export const observeProductUsageTemplate: GoalTemplate = { ...common, id: "observe-product-usage", version: "1.1.0", title: "Observe Product Usage", objective: "Determine whether committed or qualified customers use the deployed MVP and complete the offer-specific activation workflow.", recommendedOwnerRole: "product", inputPaths: ["sales/**", "business-case/OFFER.md", "experiments/**", "evidence/**", "firm/**"], outputPaths: ["product/USAGE_REPORT.md", "product/USAGE_EVENTS.*", "product/ACTIVATION_FUNNEL.*", "firm/**"], acceptanceCriteria: ["Real PRODUCTION usage from a qualified committed account exists", "Activation definition is versioned and source-backed", "Event and denominator provenance resolve", "TEST, SYNTHETIC, INTERNAL, fake-door, fixture, health, developer and Playwright traffic are excluded", "Firm builds before and after"], cannotCompleteIf: ["Only synthetic or test traffic exists", "No activation definition", "Qualified-customer correlation is absent"], writeScope: ["product/**", "evidence/**", "firm/**"], nextGoalHints: ["validate-value-realization"], prerequisites: ["validate-commercial-commitment accepted"], evidenceRequirements: ["production event IDs", "deployment ID", "qualified committed account reference", "activation definition"] };
export const validateValueRealizationTemplate: GoalTemplate = { ...common, id: "validate-value-realization", version: "1.1.0", title: "Validate Value Realization", objective: "Determine whether actual customers obtain the promised outcome rather than merely use the MVP.", recommendedOwnerRole: "research", inputPaths: ["product/USAGE_REPORT.md", "business-case/OFFER.md", "sales/**", "evidence/**", "firm/**"], outputPaths: ["product/VALUE_REALIZATION_REPORT.md", "evidence/CLAIM_EVIDENCE_LEDGER.md", "evidence/ASSUMPTION_REGISTER.md", "firm/**"], acceptanceCriteria: ["A source-backed value hypothesis exists", "A real customer outcome has resolvable evidence", "Claimed measurements are calculable", "Usage is not promoted to value without outcome evidence", "Firm builds before and after"], cannotCompleteIf: ["Only login or workflow-start evidence exists", "Synthetic evidence supports the conclusion", "Required report is absent"], writeScope: ["product/**", "evidence/**", "firm/**"], nextGoalHints: ["validate-retention"], prerequisites: ["observe-product-usage accepted"], evidenceRequirements: ["value hypothesis ID", "customer outcome evidence IDs"] };
export const validateRetentionTemplate: GoalTemplate = { ...common, id: "validate-retention", version: "1.1.0", title: "Validate Retention", objective: "Evaluate business-model-appropriate return, repeat, renewal, expansion, referral, dormancy and churn signals in a predefined observation window.", recommendedOwnerRole: "strategy", inputPaths: ["product/VALUE_REALIZATION_REPORT.md", "sales/**", "evidence/**", "firm/**"], outputPaths: ["product/RETENTION_REPORT.md", "product/CHURN_EVIDENCE.md", "business-case/ECONOMIC_OBSERVATIONS.md", "firm/**"], acceptanceCriteria: ["Retention model, rationale and immutable versioned window are defined", "Window elapsed or a qualifying real event occurred", "Revenue and costs preserve state and provenance", "Firm builds before and after"], cannotCompleteIf: ["Open window is treated as failure", "Intent is promoted to paid renewal, expansion, or referral", "Hermes substitutes for absent evidence"], writeScope: ["product/**", "business-case/ECONOMIC_OBSERVATIONS.md", "evidence/**", "firm/**"], nextGoalHints: ["analyze-unit-economics"], prerequisites: ["validate-value-realization accepted"], evidenceRequirements: ["retention window ID", "real account reference", "event/source provenance"] };

export interface UsageEventInput { eventId: string; deploymentId: string; accountRef?: string; customerRef?: string; opportunityRef?: string; offerId?: string; sessionRef?: string; userRef?: string; eventType: string; occurredAt: Date; productVersion?: string; deploymentRevision?: string; source: string; sourceRef: string; environment: typeof EVENT_ENVIRONMENTS[number]; metadata?: Record<string, unknown>; evidenceIds?: string[] }
export interface ActivationDefinition { activationId: string; offerId: string; segmentId: string; version: number; name: string; requiredEventTypes: string[]; eventOrder?: string[]; valueEventType: string; measurementWindow: string; effectiveAt: Date; sourceIds: string[] }
const excludedSource = /health(?:check)?|playwright|developer|fake[-_ ]?door|fixture|synthetic persona/i;
export function isCustomerValueEvent(event: Pick<UsageEventInput, "environment" | "eventType" | "source" | "sourceRef">) { return event.environment === "PRODUCTION" && !excludedSource.test(`${event.eventType} ${event.source} ${event.sourceRef}`); }
export function activationFunnel(events: UsageEventInput[], definition: ActivationDefinition, qualifiedAccounts: string[]) {
  const production = events.filter(isCustomerValueEvent).filter((event) => event.accountRef && qualifiedAccounts.includes(event.accountRef));
  const stages = ["ACCOUNT_CREATED", "ONBOARDING_COMPLETED", "CORE_WORKFLOW_STARTED", "CORE_WORKFLOW_COMPLETED", definition.valueEventType];
  const denominator = qualifiedAccounts.length || null;
  return stages.map((eventType) => {
    const matching = production.filter((event) => event.eventType === eventType);
    const accounts = [...new Set(matching.map((event) => event.accountRef!))];
    const times = accounts.map((account) => matching.filter((event) => event.accountRef === account).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]?.occurredAt.toISOString()).filter(Boolean);
    return { eventType, count: accounts.length, denominator, conversionRate: denominator === null ? null : accounts.length / denominator, dropOff: denominator === null ? null : denominator - accounts.length, timeToStage: times.length ? times : null, evidenceIds: [...new Set(matching.flatMap((event) => [event.eventId, ...(event.evidenceIds ?? [])]))] };
  });
}
export function assessUsage(events: UsageEventInput[], definition: ActivationDefinition | undefined, qualifiedAccounts: string[]) {
  const real = events.filter(isCustomerValueEvent), qualified = real.filter((event) => event.accountRef && qualifiedAccounts.includes(event.accountRef)), failures: string[] = [];
  if (!real.length) failures.push("No real production usage");
  if (!definition?.sourceIds.length || !definition.requiredEventTypes.length) failures.push("No complete versioned activation definition");
  if (!qualified.length) failures.push("No qualified committed customer/account usage");
  if (qualified.some((event) => !event.source || !event.sourceRef)) failures.push("Usage provenance missing");
  const activated = definition ? [...new Set(qualified.map((event) => event.accountRef!).filter((account) => definition.requiredEventTypes.every((type) => qualified.some((event) => event.accountRef === account && event.eventType === type))))] : [];
  return { pass: failures.length === 0 && activated.length > 0, hardFailure: failures.length > 0, failures, realEventCount: real.length, qualifiedEventCount: qualified.length, activatedAccounts: activated, decision: failures.length ? "INSUFFICIENT_USAGE" : activated.length ? "USAGE_CONFIRMED" : "IMPROVE_ACTIVATION" };
}
export function assessValue(input: { hypothesis?: { valueHypothesisId: string; sourceIds: string[]; evidenceRequired?: string[] }; outcomes: Array<{ accountRef: string; evidenceClass: string; evidenceIds: string[]; sourceRef: string; measurement?: Record<string, unknown> }> }) {
  const admissible = input.outcomes.filter((outcome) => !["SYNTHETIC", "ASSUMPTION", "PRODUCT_BEHAVIOR"].includes(outcome.evidenceClass) && outcome.accountRef && outcome.sourceRef && outcome.evidenceIds.length);
  const failures: string[] = [];
  if (!input.hypothesis?.sourceIds.length) failures.push("No source-backed value hypothesis");
  if (!admissible.length) failures.push("No real customer outcome evidence; usage alone is not value");
  if (admissible.some((outcome) => outcome.measurement && (outcome.measurement.value === undefined || !outcome.measurement.unit))) failures.push("Claimed measurement is not calculable");
  return { pass: failures.length === 0, hardFailure: failures.length > 0, failures, evidenceCount: admissible.length, decision: failures.length ? "GATHER_MORE_VALUE_EVIDENCE" : "VALUE_SUPPORTED" };
}
export const normalizeChurnReason = (reason?: string, provenance?: string) => reason && CHURN_REASONS.includes(reason as typeof CHURN_REASONS[number]) && provenance ? reason : "UNKNOWN";
export function productEvidenceRouting(input: { type: string; churnReason?: string; evidenceIds: string[]; repeatedCustomerRequest?: boolean }) {
  if (input.type === "CHURN" && input.churnReason === "PRODUCT_FAILURE" && input.evidenceIds.length) return "MVP_RELIABILITY" as const;
  if (input.repeatedCustomerRequest && input.evidenceIds.length >= 2) return "PRODUCT_LEARNING" as const;
  return "NONE" as const;
}
export function assessRetention(input: { model?: string; window?: { startAt: Date; endAt: Date }; now: Date; events: Array<{ type: string; stage?: string; accountRef: string; sourceRef: string; evidenceIds: string[]; referredAccountRef?: string; result?: string }> }) {
  const failures: string[] = [];
  if (!input.model || !RETENTION_MODELS.includes(input.model as typeof RETENTION_MODELS[number])) failures.push("Retention model missing");
  if (!input.window) failures.push("Predefined retention window missing");
  const qualifying = input.events.filter((event) => RETENTION_SIGNALS.includes(event.type as typeof RETENTION_SIGNALS[number]) && event.accountRef && event.sourceRef && event.evidenceIds.length && (!["RENEWAL", "EXPANSION"].includes(event.type) || event.stage === "PAID") && (event.type !== "REFERRAL" || (event.referredAccountRef && ["INTRODUCED", "ENGAGED", "CONVERTED"].includes(event.result ?? ""))));
  const waiting = Boolean(input.window && input.now < input.window.endAt && !qualifying.length);
  if (!waiting && !qualifying.length && input.window && input.now >= input.window.endAt) failures.push("Retention window elapsed without a qualifying event");
  return { pass: failures.length === 0 && !waiting && qualifying.length > 0, hardFailure: failures.length > 0, waiting, failures, qualifying, decision: waiting ? "WAIT_FOR_MORE_RETENTION" : qualifying.length ? "RETENTION_SUPPORTED" : "RETENTION_NOT_SUPPORTED" };
}
export function economicObservation(input: { revenue: Array<{ state: string; amountMinor: number; currency: string; sourceRef: string }>; costs: Array<{ costType: string; amountMinor?: number | null; currency?: string | null; provenance: string; sourceRef: string }> }) {
  const received = input.revenue.filter((record) => record.state === "RECEIVED"), refunds = input.revenue.filter((record) => record.state === "REFUNDED"), known = input.costs.filter((record) => record.amountMinor != null && record.currency && record.provenance !== "UNKNOWN"), currencies = [...new Set([...received, ...refunds].map((record) => record.currency).concat(known.map((record) => record.currency!)))];
  const netRevenueMinor = received.reduce((sum, record) => sum + record.amountMinor, 0) - refunds.reduce((sum, record) => sum + record.amountMinor, 0);
  return { receivedMinor: received.reduce((sum, record) => sum + record.amountMinor, 0), refundedMinor: refunds.reduce((sum, record) => sum + record.amountMinor, 0), netRevenueMinor, knownCostMinor: known.reduce((sum, record) => sum + record.amountMinor!, 0), currency: currencies.length === 1 ? currencies[0] : null, grossContributionObservationMinor: currencies.length === 1 ? netRevenueMinor - known.reduce((sum, record) => sum + record.amountMinor!, 0) : null, cac: null, ltv: null, grossMarginPercentage: null, paybackPeriod: null };
}
export function validateCostObservation(input: { provenance: string; amountMinor?: number | null; currency?: string | null; allocationFormula?: string | null; sourceRef: string; evidenceIds: string[] }) {
  const failures: string[] = [];
  if (!COST_PROVENANCE.includes(input.provenance as typeof COST_PROVENANCE[number])) failures.push("Invalid cost provenance");
  if (!input.sourceRef || !input.evidenceIds.length) failures.push("Cost source and evidence required");
  if (input.provenance === "ALLOCATED" && !input.allocationFormula) failures.push("Allocated cost requires formula");
  if (input.provenance !== "UNKNOWN" && (input.amountMinor == null || !input.currency)) failures.push("Known cost requires amount and currency");
  return { pass: !failures.length, failures };
}
export function compileCustomerValueReports(input: { events: UsageEventInput[]; funnel: ReturnType<typeof activationFunnel>; hypothesis?: { expectedOutcome: string; sourceIds: string[] }; outcomes: Array<{ accountRef: string; observation: string; evidenceIds: string[]; evidenceClass: string; contradictions?: string[]; measurement?: Record<string, unknown> }>; retention: Array<{ type: string; accountRef: string; stage?: string; sourceRef: string; evidenceIds: string[]; churnReason?: string }>; economics: ReturnType<typeof economicObservation> }) {
  const ids = (values: string[]) => values.join(", ") || "UNKNOWN";
  const outcomes = input.outcomes.map((outcome) => `- ${outcome.accountRef}: ${outcome.observation} [${outcome.evidenceClass}]; measurement ${JSON.stringify(outcome.measurement ?? "UNKNOWN")}; contradictions ${ids(outcome.contradictions ?? [])}; evidence ${ids(outcome.evidenceIds)}`);
  return {
    "product/USAGE_REPORT.md": ["# Usage Report", "Only qualified PRODUCTION runtime events count.", ...input.events.filter(isCustomerValueEvent).map((event) => `- ${event.eventType}: ${event.accountRef ?? "ANONYMOUS"}; revision ${event.deploymentRevision ?? event.productVersion ?? "UNKNOWN"}; evidence ${ids([event.eventId, ...(event.evidenceIds ?? [])])}`)].join("\n"),
    "product/ACTIVATION_FUNNEL.md": ["# Activation Funnel", ...input.funnel.map((stage) => `- ${stage.eventType}: ${stage.count}/${stage.denominator ?? "UNKNOWN"}; conversion ${stage.conversionRate ?? "UNKNOWN"}; time-to-stage ${stage.timeToStage?.join(", ") ?? "UNKNOWN"}; evidence ${ids(stage.evidenceIds)}`)].join("\n"),
    "product/VALUE_REALIZATION_REPORT.md": ["# Value Realization Report", `- Target outcome: ${input.hypothesis?.expectedOutcome ?? "UNKNOWN"}`, `- Hypothesis evidence: ${ids(input.hypothesis?.sourceIds ?? [])}`, "- Usage alone is not value.", "## Successful and failed outcomes", ...outcomes, "## Unknowns", ...(input.outcomes.length ? [] : ["- No source-backed customer outcome has been observed."]), "## Next action", "- Gather or evaluate source-backed customer outcomes."].join("\n"),
    "product/RETENTION_REPORT.md": ["# Retention Report", ...input.retention.filter((event) => event.type !== "CHURN").map((event) => `- ${event.type}${event.stage ? `/${event.stage}` : ""}: ${event.accountRef}; evidence ${ids(event.evidenceIds)}`)].join("\n"),
    "product/CHURN_EVIDENCE.md": ["# Churn Evidence", ...input.retention.filter((event) => event.type === "CHURN").map((event) => `- ${event.accountRef}: ${event.churnReason ?? "UNKNOWN"}; evidence ${ids(event.evidenceIds)}`)].join("\n"),
    "business-case/ECONOMIC_OBSERVATIONS.md": ["# Economic Observations", `- Revenue received: ${input.economics.currency ?? "UNKNOWN"} ${input.economics.receivedMinor}`, `- Refunds: ${input.economics.currency ?? "UNKNOWN"} ${input.economics.refundedMinor}`, `- Known serving costs: ${input.economics.currency ?? "UNKNOWN"} ${input.economics.knownCostMinor}`, `- Gross contribution observation: ${input.economics.grossContributionObservationMinor ?? "UNKNOWN"}`, "- CAC: UNKNOWN", "- LTV: UNKNOWN", "- Gross margin percentage: UNKNOWN", "- Payback period: UNKNOWN"].join("\n"),
    "evidence/CLAIM_EVIDENCE_LEDGER.md": ["# Claim Evidence Ledger", ...input.outcomes.map((outcome) => `- ${outcome.observation} — ${ids(outcome.evidenceIds)}`)].join("\n"),
    "evidence/ASSUMPTION_REGISTER.md": ["# Assumption Register", "- Numeric baselines and downstream economics remain assumptions unless backed by cited evidence."].join("\n"),
  };
}

interface CustomerValueHooks {
  firmBuild?(phase: "before" | "after"): Promise<{ success: boolean }>;
  writeFirm?(records: unknown[]): Promise<void>;
  writeArtifacts?(artifacts: Record<string, string>): Promise<void>;
  judge?(stage: "USAGE" | "VALUE" | "RETENTION", deterministic: { pass: boolean; hardFailure: boolean; failures: string[] }, evidence: unknown[]): Promise<{ verdict: string; decision?: string }>;
  wakeIssue?(issueId: string): Promise<void>;
  promoteProductFailure?(input: { companyId: string; accountRef: string; sourceRef: string; evidenceIds: string[] }): Promise<unknown>;
  recordProductLearning?(input: { companyId: string; accountRef: string; sourceRef: string; evidenceIds: string[]; summary: string }): Promise<unknown>;
}
export function customerValueService(db: Db, hooks: CustomerValueHooks = {}) {
  const content = founderosContentService(db);
  const reliability = mvpReliabilityService(db);
  const activity = (companyId: string, action: string, entityId: string, details: Record<string, unknown>) => db.insert(activityLog).values({ companyId, actorType: "system", actorId: "customer-value", action, entityType: "customer_value", entityId, details });
  async function firmMutation(records: unknown[]) { if (hooks.firmBuild && !(await hooks.firmBuild("before")).success) throw new Error("Firm build before customer-value update failed"); await hooks.writeFirm?.(records); if (hooks.firmBuild && !(await hooks.firmBuild("after")).success) throw new Error("Firm build after customer-value update failed"); }
  async function stale(companyId: string, evidenceId: string, reason: string) { for (const artifact of ["BMC", "financial-case", "GTM", "business-plan", "pitch", "kickstarter-economics", "content-value-claims"]) await db.insert(artifactStaleness).values({ companyId, artifact, reason, evidenceId, affectedDependency: "customer-value" }).onConflictDoNothing(); }
  async function activate(input: { companyId: string; parentGoalId: string; sourceRepository: string; sourceCommit: string }) {
    const source = { repository: input.sourceRepository, commit: input.sourceCommit };
    const usage = await content.instantiateGoal(input.companyId, source, observeProductUsageTemplate, input.parentGoalId);
    const value = await content.instantiateGoal(input.companyId, source, validateValueRealizationTemplate, usage.goal.id);
    const retention = await content.instantiateGoal(input.companyId, source, validateRetentionTemplate, value.goal.id);
    const project = await content.activateSystem(input.companyId, source, customerValueSystem, usage.goal.id, usage.goal.ownerAgentId!);
    const work = [[usage.goal, "Verify production usage"], [usage.goal, "Analyze activation"], [value.goal, "Measure customer outcomes"], [retention.goal, "Observe retention window"], [retention.goal, "Analyze churn"], [retention.goal, "Capture economic observations"]] as const;
    const created = []; for (const [goal, title] of work) created.push((await content.createGoalIssue(input.companyId, goal.id, project.project.id, goal.ownerAgentId!, title)).issue);
    return { project: project.project, usageGoal: usage.goal, valueGoal: value.goal, retentionGoal: retention.goal, issues: created };
  }
  async function ingestUsage(companyId: string, input: UsageEventInput) {
    if (!EVENT_ENVIRONMENTS.includes(input.environment)) throw new Error("Invalid event environment");
    if (!PRODUCT_EVENT_TYPES.includes(input.eventType as typeof PRODUCT_EVENT_TYPES[number])) throw new Error("Unknown product event type");
    if (!input.source || !input.sourceRef) throw new Error("Event-source provenance required");
    const deployment = await db.select().from(companyDeployments).where(and(eq(companyDeployments.companyId, companyId), eq(companyDeployments.deploymentId, input.deploymentId))).limit(1).then((rows) => rows[0]);
    if (!deployment) throw new Error("Company deployment not found");
    const existing = await db.select().from(productUsageEvents).where(and(eq(productUsageEvents.companyId, companyId), eq(productUsageEvents.eventId, input.eventId))).limit(1).then((rows) => rows[0]);
    if (existing) return { event: existing, duplicate: true, counted: isCustomerValueEvent(input) };
    const [event] = await db.insert(productUsageEvents).values({ ...input, companyId, deploymentId: deployment.id, metadata: input.metadata ?? {}, evidenceIds: input.evidenceIds ?? [] }).returning();
    if (isCustomerValueEvent(input)) {
      const action = input.eventType === "CORE_WORKFLOW_COMPLETED" ? "customer.core_workflow_completed" : input.eventType === "RETURN_SESSION" ? "customer.returned" : "customer.usage_observed";
      await activity(companyId, action, event.id, { eventType: input.eventType, accountRef: input.accountRef, sourceRef: input.sourceRef });
      if (["RETURN_SESSION", "ERROR_ENCOUNTERED"].includes(input.eventType)) await wake(companyId, input.eventType, input.eventId);
    }
    return { event, duplicate: false, counted: isCustomerValueEvent(input) };
  }
  async function defineActivation(companyId: string, input: ActivationDefinition) {
    if (!input.requiredEventTypes.length || !input.sourceIds.length || input.version < 1) throw new Error("Versioned activation requires meaningful events and source provenance");
    const existing = await db.select().from(activationDefinitions).where(and(eq(activationDefinitions.companyId, companyId), eq(activationDefinitions.activationId, input.activationId), eq(activationDefinitions.version, input.version))).limit(1).then((rows) => rows[0]);
    if (existing) { const same = existing.offerId === input.offerId && JSON.stringify(existing.requiredEventTypes) === JSON.stringify(input.requiredEventTypes); if (!same) throw new Error("Activation definition versions are immutable; create a new version"); return { definition: existing, reused: true }; }
    const [definition] = await db.insert(activationDefinitions).values({ ...input, companyId, eventOrder: input.eventOrder ?? [] }).returning(); return { definition, reused: false };
  }
  async function defineValueHypothesis(companyId: string, input: Omit<typeof valueHypotheses.$inferInsert, "companyId">) {
    if (!input.sourceIds.length || !input.evidenceRequired.length) throw new Error("Value hypothesis requires sources and required evidence");
    const existing = await db.select().from(valueHypotheses).where(and(eq(valueHypotheses.companyId, companyId), eq(valueHypotheses.valueHypothesisId, input.valueHypothesisId))).limit(1).then((rows) => rows[0]);
    if (existing) return { hypothesis: existing, reused: true };
    const [hypothesis] = await db.insert(valueHypotheses).values({ ...input, companyId }).returning(); return { hypothesis, reused: false };
  }
  async function recordOutcome(companyId: string, input: Omit<typeof customerOutcomes.$inferInsert, "companyId">) {
    if (!VALUE_EVIDENCE_CLASSES.includes(input.evidenceClass as typeof VALUE_EVIDENCE_CLASSES[number]) || !input.evidenceIds.length || !input.sourceRef) throw new Error("Outcome class and evidence provenance required");
    const hypothesis = await db.select().from(valueHypotheses).where(and(eq(valueHypotheses.companyId, companyId), eq(valueHypotheses.valueHypothesisId, input.valueHypothesisId))).limit(1).then((rows) => rows[0]);
    if (!hypothesis) throw new Error("Company value hypothesis not found");
    const [outcome] = await db.insert(customerOutcomes).values({ ...input, companyId }).onConflictDoNothing().returning();
    if (outcome) { await firmMutation([{ type: "customer_outcome", id: outcome.outcomeId, accountRef: outcome.accountRef, valueHypothesisId: outcome.valueHypothesisId, evidenceIds: outcome.evidenceIds }]); await stale(companyId, outcome.outcomeId, "Customer outcome evidence changed"); await activity(companyId, "customer.value_event_recorded", outcome.id, { accountRef: outcome.accountRef, evidenceClass: outcome.evidenceClass }); }
    return outcome;
  }
  async function openRetentionWindow(companyId: string, input: Omit<typeof retentionWindows.$inferInsert, "companyId" | "status">) {
    if (!RETENTION_MODELS.includes(input.model as typeof RETENTION_MODELS[number]) || !input.rationale || !input.sourceIds.length) throw new Error("Retention model requires rationale and provenance");
    if (input.startAt >= input.endAt || input.version < 1) throw new Error("Retention window must be predefined and versioned");
    const existing = await db.select().from(retentionWindows).where(and(eq(retentionWindows.companyId, companyId), eq(retentionWindows.windowId, input.windowId))).limit(1).then((rows) => rows[0]);
    if (existing) { const same = existing.version === input.version && existing.endAt.getTime() === input.endAt.getTime() && existing.requiredSignal === input.requiredSignal; if (!same) throw new Error("Retention window is immutable; create a new window ID/version"); return { window: existing, reused: true }; }
    const [window] = await db.insert(retentionWindows).values({ ...input, companyId, status: "OPEN" }).returning(); return { window, reused: false };
  }
  async function waitForRetention(companyId: string, issueId: string, windowId: string) {
    const issue = await db.select().from(issues).where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).limit(1).then((rows) => rows[0]);
    const window = await db.select().from(retentionWindows).where(and(eq(retentionWindows.companyId, companyId), eq(retentionWindows.windowId, windowId))).limit(1).then((rows) => rows[0]);
    if (!issue?.goalId || !issue.projectId || !window) throw new Error("Bound retention Issue and window required");
    const [row] = await db.insert(marketWaits).values({ companyId, goalId: issue.goalId, projectId: issue.projectId, issueId, stage: "RETENTION_WINDOW", reason: `Waiting until ${window.endAt.toISOString()} or qualifying signal`, wakeConditions: [...RETENTION_SIGNALS.map((type) => ({ type })), { type: "retention_window_expired", at: window.endAt.toISOString() }, { type: "customer_interaction" }, { type: "operator_resumed" }], status: "WAITING_FOR_MARKET" }).onConflictDoNothing().returning();
    await db.update(issues).set({ status: "blocked", updatedAt: new Date() }).where(eq(issues.id, issue.id));
    await activity(companyId, "retention.waiting_for_market", issue.id, { windowId, julesPolling: false, endAt: window.endAt }); return row;
  }
  async function wake(companyId: string, trigger: string, evidenceId: string) {
    const waits = await db.select().from(marketWaits).where(and(eq(marketWaits.companyId, companyId), eq(marketWaits.stage, "RETENTION_WINDOW"), eq(marketWaits.status, "WAITING_FOR_MARKET")));
    for (const wait of waits) { if (!wait.wakeConditions.some((condition) => condition.type === trigger)) continue; await db.update(marketWaits).set({ status: "WOKEN", wokenBy: `${trigger}:${evidenceId}`, wokenAt: new Date() }).where(eq(marketWaits.id, wait.id)); await db.update(issues).set({ status: "todo", updatedAt: new Date() }).where(eq(issues.id, wait.issueId)); await hooks.wakeIssue?.(wait.issueId); }
    return { woken: waits.length };
  }
  async function expireRetentionWindows(companyId: string, now = new Date()) {
    const windows = await db.select().from(retentionWindows).where(and(eq(retentionWindows.companyId, companyId), eq(retentionWindows.status, "OPEN")));
    const expired = windows.filter((window) => window.endAt <= now);
    for (const window of expired) { await db.update(retentionWindows).set({ status: "ELAPSED", updatedAt: now }).where(eq(retentionWindows.id, window.id)); await wake(companyId, "retention_window_expired", window.windowId); await activity(companyId, "retention.window_completed", window.id, { windowId: window.windowId }); }
    return { expired: expired.length };
  }
  async function recordRetention(companyId: string, input: Omit<typeof retentionEvents.$inferInsert, "companyId"> & { windowRef?: string; productLearningSummary?: string; productContext?: { deploymentId: string; projectId: string; goalId: string; endpoint?: string; revision?: string } }) {
    if (!RETENTION_SIGNALS.includes(input.type as typeof RETENTION_SIGNALS[number])) throw new Error("Unsupported retention signal");
    if (["RENEWAL", "EXPANSION"].includes(input.type) && !["DISCUSSED", "QUOTED", "ACCEPTED", "PAID"].includes(input.stage ?? "")) throw new Error("Commercial stage required");
    if (input.type === "REFERRAL" && (!input.referredAccountRef || !input.channel || !["INTENT", "INTRODUCED", "ENGAGED", "CONVERTED"].includes(input.result ?? ""))) throw new Error("Referral target, channel, and result stage required");
    if (input.type === "CHURN" && input.churnReason === "PRODUCT_FAILURE" && input.churnReasonProvenance && !hooks.promoteProductFailure && !input.productContext) throw new Error("Product failure requires deployment and native Reliability Project/Goal context");
    if (input.productLearningSummary && !hooks.recordProductLearning && !input.productContext) throw new Error("Product learning requires deployment context");
    const window = input.windowRef ? await db.select().from(retentionWindows).where(and(eq(retentionWindows.companyId, companyId), eq(retentionWindows.windowId, input.windowRef))).limit(1).then((rows) => rows[0]) : undefined;
    const reason = input.type === "CHURN" ? normalizeChurnReason(input.churnReason ?? undefined, input.churnReasonProvenance ?? undefined) : input.churnReason;
    const { windowRef: _windowRef, productLearningSummary: _learning, productContext: _context, ...record } = input;
    const [event] = await db.insert(retentionEvents).values({ ...record, companyId, windowId: window?.id, churnReason: reason }).onConflictDoNothing().returning();
    if (!event) return undefined;
    if (window && assessRetention({ model: window.model, window, now: event.occurredAt, events: [{ type: event.type, stage: event.stage ?? undefined, accountRef: event.accountRef, sourceRef: event.sourceRef, evidenceIds: event.evidenceIds, referredAccountRef: event.referredAccountRef ?? undefined, result: event.result ?? undefined }] }).pass) await db.update(retentionWindows).set({ status: "SIGNAL_OBSERVED", updatedAt: new Date() }).where(eq(retentionWindows.id, window.id));
    const action = input.type === "CHURN" ? "customer.churned" : input.type === "RENEWAL" && input.stage === "PAID" ? "customer.renewal_recorded" : input.type === "RETURN_SESSION" ? "customer.returned" : "customer.retention_signal";
    await activity(companyId, action, event.id, { type: input.type, stage: input.stage, accountRef: input.accountRef, julesPolling: false }); await wake(companyId, input.type, input.retentionEventId);
    await firmMutation([{ type: "retention_event", id: event.retentionEventId, accountRef: event.accountRef, signal: event.type, stage: event.stage, evidenceIds: event.evidenceIds }]); await stale(companyId, event.retentionEventId, "Retention or churn evidence changed");
    if (input.type === "CHURN" && reason === "PRODUCT_FAILURE") {
      if (hooks.promoteProductFailure) await hooks.promoteProductFailure({ companyId, accountRef: input.accountRef, sourceRef: input.sourceRef, evidenceIds: input.evidenceIds });
      else {
        if (!input.productContext) throw new Error("Product failure requires deployment and native Reliability Project/Goal context");
        const observed = await reliability.observe(companyId, input.productContext.deploymentId, { ok: false, type: "USER_REPORTED_DEFECT", summary: `Customer ${input.accountRef} churned after a product failure`, endpoint: input.productContext.endpoint ?? "/", rawSourceReference: input.sourceRef, revision: input.productContext.revision, observedAt: input.occurredAt, evidenceIds: input.evidenceIds, commerciallyBlocking: true, source: "customer-value" });
        const observation = (observed as { observation?: { observationId: string } }).observation;
        if (!observation) throw new Error("MVP Reliability observation was not created");
        const promoted = await reliability.promote(companyId, observation.observationId, input.productContext.projectId, input.productContext.goalId);
        await db.update(retentionEvents).set({ reliabilityObservationId: observation.observationId, reliabilityIssueId: promoted.issue?.id }).where(eq(retentionEvents.id, event.id));
      }
    }
    if (input.productLearningSummary) {
      if (hooks.recordProductLearning) await hooks.recordProductLearning({ companyId, accountRef: input.accountRef, sourceRef: input.sourceRef, evidenceIds: input.evidenceIds, summary: input.productLearningSummary });
      else { if (!input.productContext) throw new Error("Product learning requires deployment context"); await reliability.recordLearning(companyId, input.productContext.deploymentId, { summary: input.productLearningSummary, endpoint: input.productContext.endpoint ?? "/", rawSourceReference: input.sourceRef, revision: input.productContext.revision, observedAt: input.occurredAt, evidenceIds: input.evidenceIds, source: "customer-value" }); }
    }
    return event;
  }
  async function recordCost(companyId: string, input: Omit<typeof customerCostObservations.$inferInsert, "companyId">) {
    const validation = validateCostObservation(input);
    if (!validation.pass) throw new Error(validation.failures.join("; "));
    const [record] = await db.insert(customerCostObservations).values({ ...input, companyId }).onConflictDoNothing().returning();
    if (record) { await firmMutation([{ type: "cost_observation", id: record.costObservationId, accountRef: record.accountRef, costType: record.costType, provenance: record.provenance, evidenceIds: record.evidenceIds }]); await stale(companyId, record.costObservationId, "Customer serving cost changed"); }
    return record;
  }
  async function qualifiedCommittedAccounts(companyId: string) {
    const prospects = await db.select().from(salesProspects).where(eq(salesProspects.companyId, companyId));
    const interactions = await db.select().from(salesInteractions).where(eq(salesInteractions.companyId, companyId));
    const commitments = await db.select().from(commercialCommitments).where(eq(commercialCommitments.companyId, companyId));
    const committedInteractionIds = new Set(commitments.filter((commitment) => commitment.strength >= 7).map((commitment) => commitment.interactionDbId).filter(Boolean));
    const committedProspectIds = new Set(interactions.filter((interaction) => committedInteractionIds.has(interaction.id)).map((interaction) => interaction.prospectDbId));
    return prospects.filter((prospect) => ["QUALIFIED", "OUTREACH_READY", "ICP_MATCH"].includes(prospect.qualification) && committedProspectIds.has(prospect.id)).map((prospect) => prospect.prospectId);
  }
  async function evaluate(companyId: string, stage: "USAGE" | "VALUE" | "RETENTION", deterministic: { pass: boolean; hardFailure: boolean; failures: string[] }, evidence: unknown[]) {
    if (!deterministic.pass) return { deterministic, judgment: null, accepted: false };
    await firmMutation(evidence);
    const judgment = await hooks.judge?.(stage, deterministic, evidence);
    if (deterministic.hardFailure && judgment?.verdict === "ACCEPT") throw new Error("Hermes cannot override absent real customer evidence");
    return { deterministic, judgment: judgment ?? null, accepted: judgment ? judgment.verdict === "ACCEPT" : false };
  }
  async function compileAndWrite(input: Parameters<typeof compileCustomerValueReports>[0]) { const artifacts = compileCustomerValueReports(input); await hooks.writeArtifacts?.(artifacts); return artifacts; }
  async function finalize(companyId: string, records: unknown[], evidenceId: string) { await firmMutation(records); await stale(companyId, evidenceId, "Customer value, retention, churn, cost, revenue, or price evidence changed"); return { nextGoal: "analyze-unit-economics" as const }; }
  return { activate, ingestUsage, defineActivation, defineValueHypothesis, recordOutcome, openRetentionWindow, waitForRetention, wake, expireRetentionWindows, recordRetention, recordCost, qualifiedCommittedAccounts, evaluate, compileAndWrite, finalize };
}
