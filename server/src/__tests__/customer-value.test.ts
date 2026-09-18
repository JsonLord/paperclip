import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  activationFunnel, assessRetention, assessUsage, assessValue, CHURN_REASONS,
  compileCustomerValueReports, customerValueService, customerValueSystem, economicObservation,
  isCustomerValueEvent, normalizeChurnReason, observeProductUsageTemplate, productEvidenceRouting,
  RETENTION_MODELS, validateCostObservation, validateRetentionTemplate, validateValueRealizationTemplate,
  type ActivationDefinition, type UsageEventInput,
} from "../services/customer-value.js";
const scenarios = JSON.parse(readFileSync(new URL("./fixtures/customer-value/scenarios.json", import.meta.url), "utf8"));
const at = new Date("2026-09-01T00:00:00Z"), end = new Date("2026-10-01T00:00:00Z");
const definition: ActivationDefinition = { activationId: "activation-1", offerId: "offer-1", segmentId: "segment-1", version: 1, name: "Complete and view first report", requiredEventTypes: ["CORE_WORKFLOW_COMPLETED", "OUTPUT_VIEWED"], eventOrder: ["CORE_WORKFLOW_COMPLETED", "OUTPUT_VIEWED"], valueEventType: "OUTPUT_VIEWED", measurementWindow: "7 days", effectiveAt: at, sourceIds: ["offer-1"] };
const event = (eventType: string, environment: "PRODUCTION" | "TEST" | "SYNTHETIC" | "INTERNAL" = "PRODUCTION", accountRef = "account-1", source = "tinybird"): UsageEventInput => ({ eventId: `event-${eventType}-${environment}`, deploymentId: "deployment-1", accountRef, eventType, occurredAt: at, source, sourceRef: `${source}:${eventType}`, environment, evidenceIds: [`evidence-${eventType}`] });
const signal = (type: string, extra: Record<string, unknown> = {}) => ({ type, accountRef: "account-1", sourceRef: `source:${type}`, evidenceIds: [`evidence-${type}`], ...extra });

describe("customer value and retention", () => {
  it("maps one native project to three dependent native goals and the economics handoff", () => {
    expect(customerValueSystem.title).toBe("Customer Value & Retention");
    expect(customerValueSystem.goals).toEqual(["observe-product-usage", "validate-value-realization", "validate-retention"]);
    expect(observeProductUsageTemplate.nextGoalHints).toEqual(["validate-value-realization"]);
    expect(validateValueRealizationTemplate.nextGoalHints).toEqual(["validate-retention"]);
    expect(validateRetentionTemplate.nextGoalHints).toEqual(["analyze-unit-economics"]);
  });
  it("counts only real production use and excludes all non-customer sources", () => {
    const events = [event("CORE_WORKFLOW_COMPLETED"), event("OUTPUT_VIEWED"), event("OUTPUT_VIEWED", "TEST"), event("OUTPUT_VIEWED", "SYNTHETIC"), event("OUTPUT_VIEWED", "INTERNAL"), event("OUTPUT_VIEWED", "PRODUCTION", "account-1", "playwright-fixture"), event("OUTPUT_VIEWED", "PRODUCTION", "account-1", "fake-door")];
    expect(events.filter(isCustomerValueEvent)).toHaveLength(2);
    expect(assessUsage(events, definition, ["account-1"])).toMatchObject({ pass: true, decision: "USAGE_CONFIRMED", realEventCount: 2 });
    expect(assessUsage(events, definition, ["other"]).pass).toBe(false);
  });
  it("does not treat signup or login as activation", () => {
    expect(assessUsage([event("SIGNED_IN")], definition, ["account-1"])).toMatchObject({ pass: false, decision: "IMPROVE_ACTIVATION" });
  });
  it("keeps an unknown denominator unknown and retains funnel evidence and time-to-stage", () => {
    const unknown = activationFunnel([event("OUTPUT_VIEWED")], definition, []);
    expect(unknown.every((stage) => stage.denominator === null && stage.conversionRate === null)).toBe(true);
    const known = activationFunnel([event("CORE_WORKFLOW_COMPLETED"), event("OUTPUT_VIEWED")], definition, ["account-1"]);
    expect(known.at(-1)).toMatchObject({ count: 1, denominator: 1, conversionRate: 1 });
    expect(known.at(-1)?.evidenceIds).toContain("event-OUTPUT_VIEWED-PRODUCTION");
    expect(known.at(-1)?.timeToStage).toEqual([at.toISOString()]);
  });
  it("does not equate usage with value or admit synthetic, assumed, or behavior-only outcomes", () => {
    const hypothesis = { valueHypothesisId: "vh-1", sourceIds: ["offer-1"] };
    expect(assessValue({ hypothesis, outcomes: [{ accountRef: "account-1", evidenceClass: "PRODUCT_BEHAVIOR", evidenceIds: ["event-1"], sourceRef: "tinybird:1" }] }).pass).toBe(false);
    expect(assessValue({ hypothesis, outcomes: [{ accountRef: "account-1", evidenceClass: "CUSTOMER_REPORTED_OUTCOME", evidenceIds: ["interview-1"], sourceRef: "call:1" }] }).decision).toBe("VALUE_SUPPORTED");
    expect(assessValue({ hypothesis, outcomes: [{ accountRef: "account-1", evidenceClass: "MEASURED_TIME_SAVING", evidenceIds: ["timer-1"], sourceRef: "timer:1", measurement: { value: 10 } }] }).pass).toBe(false);
  });
  it("uses business-model-specific immutable windows and waiting semantics", () => {
    expect(RETENTION_MODELS).toContain("ONE_OFF_WITH_REFERRAL");
    expect(customerValueSystem.wakeConditions).toEqual(expect.arrayContaining(["RETURN_SESSION", "retention_window_expired", "operator_resumed"]));
    const open = assessRetention({ model: "REPEATED_USAGE", window: { startAt: at, endAt: end }, now: new Date("2026-09-15"), events: [] });
    expect(open).toMatchObject({ waiting: true, decision: "WAIT_FOR_MORE_RETENTION", pass: false });
    expect(assessRetention({ model: "REPEATED_USAGE", window: { startAt: at, endAt: end }, now: new Date("2026-09-15"), events: [signal("RETURN_SESSION")] })).toMatchObject({ waiting: false, pass: true });
  });
  it("distinguishes value once from retention", () => {
    expect(assessRetention({ model: "REPEATED_USAGE", window: { startAt: at, endAt: end }, now: new Date("2026-09-15"), events: [signal("CORE_WORKFLOW_COMPLETED")] }).pass).toBe(false);
  });
  it("distinguishes renewal discussion from payment and referral intent from introduction", () => {
    expect(assessRetention({ model: "RECURRING_SUBSCRIPTION", window: { startAt: at, endAt: end }, now: at, events: [signal("RENEWAL", { stage: "DISCUSSED" })] }).pass).toBe(false);
    expect(assessRetention({ model: "RECURRING_SUBSCRIPTION", window: { startAt: at, endAt: end }, now: at, events: [signal("RENEWAL", { stage: "PAID" })] }).pass).toBe(true);
    expect(assessRetention({ model: "REFERRAL", window: { startAt: at, endAt: end }, now: at, events: [signal("REFERRAL", { referredAccountRef: "account-2", result: "INTENT" })] }).pass).toBe(false);
    expect(assessRetention({ model: "REFERRAL", window: { startAt: at, endAt: end }, now: at, events: [signal("REFERRAL", { referredAccountRef: "account-2", result: "INTRODUCED" })] }).pass).toBe(true);
  });
  it("requires churn provenance, preserves UNKNOWN, and routes only proven product failure", () => {
    expect(CHURN_REASONS).toContain("PRODUCT_FAILURE");
    expect(normalizeChurnReason("PRICE", undefined)).toBe("UNKNOWN");
    expect(normalizeChurnReason("PRICE", "call:1")).toBe("PRICE");
    expect(productEvidenceRouting({ type: "CHURN", churnReason: "PRODUCT_FAILURE", evidenceIds: ["runtime-1"] })).toBe("MVP_RELIABILITY");
    expect(productEvidenceRouting({ type: "CHURN", churnReason: "PRODUCT_FAILURE", evidenceIds: [] })).toBe("NONE");
    expect(productEvidenceRouting({ type: "REQUEST", evidenceIds: ["customer-1", "customer-2"], repeatedCustomerRequest: true })).toBe("PRODUCT_LEARNING");
  });
  it("enforces measured, allocated, estimated and unknown cost provenance", () => {
    expect(validateCostObservation({ provenance: "ALLOCATED", amountMinor: 100, currency: "USD", sourceRef: "invoice", evidenceIds: ["invoice-1"] }).pass).toBe(false);
    expect(validateCostObservation({ provenance: "ALLOCATED", amountMinor: 100, currency: "USD", allocationFormula: "monthly / active accounts", sourceRef: "invoice", evidenceIds: ["invoice-1"] }).pass).toBe(true);
    expect(validateCostObservation({ provenance: "UNKNOWN", sourceRef: "operator", evidenceIds: ["unknown-1"] }).pass).toBe(true);
  });
  it("counts only received revenue, subtracts refunds, and leaves unsupported economics unknown", () => {
    const result = economicObservation({ revenue: [{ state: "QUOTED", amountMinor: 9000, currency: "USD", sourceRef: "quote" }, { state: "RECEIVED", amountMinor: 1000, currency: "USD", sourceRef: "payment" }, { state: "REFUNDED", amountMinor: 200, currency: "USD", sourceRef: "refund" }], costs: [{ costType: "SUPPORT_TIME", amountMinor: 2500, currency: "USD", provenance: "MEASURED", sourceRef: "timesheet" }] });
    expect(result).toMatchObject({ receivedMinor: 1000, refundedMinor: 200, netRevenueMinor: 800, knownCostMinor: 2500, grossContributionObservationMinor: -1700, cac: null, ltv: null, grossMarginPercentage: null, paybackPeriod: null });
  });
  it("does not invoke Hermes or Firm when deterministic real evidence is absent", async () => {
    const judge = vi.fn(), firmBuild = vi.fn();
    const service = customerValueService({} as Db, { judge, firmBuild });
    const result = await service.evaluate("company-1", "USAGE", { pass: false, hardFailure: true, failures: ["No real production usage"] }, []);
    expect(result.accepted).toBe(false); expect(judge).not.toHaveBeenCalled(); expect(firmBuild).not.toHaveBeenCalled();
  });
  it("runs Firm before and after, then lets Hermes judge only a passing deterministic gate", async () => {
    const order: string[] = [];
    const service = customerValueService({} as Db, { firmBuild: async (phase) => { order.push(`firm-${phase}`); return { success: true }; }, writeFirm: async () => { order.push("firm-write"); }, judge: async () => { order.push("hermes"); return { verdict: "ACCEPT" }; } });
    const result = await service.evaluate("company-1", "VALUE", { pass: true, hardFailure: false, failures: [] }, [{ type: "customer_outcome", id: "outcome-1" }]);
    expect(result.accepted).toBe(true); expect(order).toEqual(["firm-before", "firm-write", "firm-after", "hermes"]);
  });
  it("compiles all evidence-linked Second Brain views without fabricating economics", () => {
    const economics = economicObservation({ revenue: [], costs: [] });
    const reports = compileCustomerValueReports({ events: [event("OUTPUT_VIEWED")], funnel: activationFunnel([event("OUTPUT_VIEWED")], definition, ["account-1"]), outcomes: [{ accountRef: "account-1", observation: "report accepted", evidenceIds: ["call-1"], evidenceClass: "CUSTOMER_REPORTED_OUTCOME" }], retention: [{ ...signal("CHURN"), churnReason: "UNKNOWN" }], economics });
    expect(Object.keys(reports)).toEqual(expect.arrayContaining(["product/USAGE_REPORT.md", "product/ACTIVATION_FUNNEL.md", "product/VALUE_REALIZATION_REPORT.md", "product/RETENTION_REPORT.md", "product/CHURN_EVIDENCE.md", "business-case/ECONOMIC_OBSERVATIONS.md", "evidence/CLAIM_EVIDENCE_LEDGER.md", "evidence/ASSUMPTION_REGISTER.md"]));
    expect(reports["business-case/ECONOMIC_OBSERVATIONS.md"]).toContain("LTV: UNKNOWN");
  });
  it("contains fixtures A-J for commitment, use, value, retention, churn, and economics", () => {
    expect(scenarios.map((scenario: { id: string }) => scenario.id)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
    expect(scenarios.find((scenario: { id: string }) => scenario.id === "J").expectedContributionMinor).toBe(-1500);
  });
});
