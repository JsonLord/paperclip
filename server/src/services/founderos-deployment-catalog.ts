import type { GoalTemplate } from "./founderos-content/index.js";
import { MCP_SERVERS } from "@paperclipai/adapter-jules";
import { validateProblemTemplate } from "./customer-discovery.js";
import { defineInitialIcpTemplate, analyzeMarketTemplate } from "./market-intelligence.js";
import { validateOfferTemplate, validateDemandTemplate } from "./offer-demand.js";
import { buildProspectUniverseTemplate, validateCommercialCommitmentTemplate } from "./commercial-validation.js";
import { maintainMvpReliabilityTemplate } from "./mvp-reliability.js";
import { observeProductUsageTemplate, validateValueRealizationTemplate, validateRetentionTemplate } from "./customer-value.js";
import { analyzeUnitEconomicsTemplate } from "./unit-economics.js";
import { compileBusinessModelCanvasTemplate } from "./business-model-canvas.js";
import { compileBpwFinancialPlanTemplate } from "./financial-planning.js";
import { compileBusinessPlanTemplate } from "./business-plan.js";
import { compilePitchTemplate } from "./pitch.js";
import { contentGoalTemplates } from "./content-gtm.js";
import { kickstarterGoalTemplates } from "./crowdfunding.js";

export const founderOsDeploymentGoalTemplates: GoalTemplate[] = [
  validateProblemTemplate,
  defineInitialIcpTemplate,
  analyzeMarketTemplate,
  validateOfferTemplate,
  validateDemandTemplate,
  buildProspectUniverseTemplate,
  validateCommercialCommitmentTemplate,
  maintainMvpReliabilityTemplate,
  observeProductUsageTemplate,
  validateValueRealizationTemplate,
  validateRetentionTemplate,
  analyzeUnitEconomicsTemplate,
  compileBusinessModelCanvasTemplate,
  compileBpwFinancialPlanTemplate,
  compileBusinessPlanTemplate,
  compilePitchTemplate,
  ...contentGoalTemplates,
  ...kickstarterGoalTemplates,
];

/**
 * One role in the FounderOS workforce.
 *
 * `mcp` names the servers the role is granted and `goals` the goal templates it owns. Both
 * feed the resource folder written at bootstrap, so the guide an agent reads and the
 * capability list on its dispatch come from the same line. Add a server here and the
 * prompt, the guide, and the README index all follow.
 */
export interface WorkforceMember {
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly roleAliases: readonly string[];
  /** Capability tokens into the adapter's MCP registry. */
  readonly mcp: readonly string[];
  /** Goal template IDs this role owns or materially contributes to. */
  readonly goals: readonly string[];
}

export const founderOsWorkforce: readonly WorkforceMember[] = [
  { key: "evidence", name: "Evidence Steward", title: "Evidence / Validation", roleAliases: ["evidence"], mcp: ["context7"], goals: ["validate-problem", "analyze-market", "bpw-business-plan"] },
  { key: "market", name: "Market Analyst", title: "Market / ICP Research", roleAliases: ["market"], mcp: ["context7"], goals: ["analyze-market", "define-initial-icp"] },
  { key: "researcher", name: "Future Researcher", title: "Long‑form Researcher", roleAliases: ["researcher", "analyst"], mcp: ["context7", "tinybird"], goals: ["analyze-market", "bpw-business-plan", "bpw-financial-planning"] },
  { key: "customer", name: "Customer Researcher", title: "Customer Discovery / Value", roleAliases: ["customer", "research"], mcp: ["linear"], goals: ["validate-problem", "define-initial-icp", "validate-value-realization"] },
  { key: "experiment", name: "Growth Experimenter", title: "Offer / Demand Experiments", roleAliases: ["experiment"], mcp: ["stitch", "v0", "tinybird", "supabase"], goals: ["validate-offer", "validate-demand", "observe-product-usage"] },
  { key: "sales", name: "Commercial Lead", title: "Prospecting / Commercial Commitment", roleAliases: ["prospect", "sales"], mcp: ["linear"], goals: ["build-prospect-universe", "validate-commercial-commitment", "prospecting"] },
  { key: "product", name: "Product Lead", title: "Usage / Retention / Strategy", roleAliases: ["product", "strategy"], mcp: ["tinybird", "linear", "neon"], goals: ["validate-retention", "observe-product-usage", "validate-value-realization"] },
  { key: "engineering", name: "Product Engineer", title: "MVP Reliability", roleAliases: ["engineering"], mcp: ["context7", "v0", "neon", "supabase"], goals: ["maintain-mvp-reliability", "validate-demand"] },
  { key: "finance", name: "Finance Lead", title: "Economics / Financial Planning", roleAliases: ["finance"], mcp: ["tinybird", "neon"], goals: ["analyze-unit-economics", "unit-economics", "bpw-financial-planning", "compile-bpw-financial-plan"] },
  { key: "business", name: "Business Case Architect", title: "Business Model / Plan / Pitch", roleAliases: ["business model architect", "business plan editor", "pitch-agent"], mcp: ["context7", "stitch", "linear"], goals: ["business-model", "compile-business-model-canvas", "bpw-business-plan", "compile-business-plan", "bpw-pitch", "compile-pitch"] },
  { key: "content", name: "Content & GTM Lead", title: "Content / GTM / Crowdfunding", roleAliases: ["content", "crowdfunding"], mcp: ["stitch", "v0", "tinybird"], goals: ["content-distribution", "kickstarter-crowdfunding", "validate-demand"] },
] as const;

export function validateDeploymentCatalog(templates = founderOsDeploymentGoalTemplates) {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const template of templates) {
    if (ids.has(template.id)) errors.push(`Duplicate Goal template ${template.id}`);
    ids.add(template.id);
    if (!template.acceptanceCriteria.length) errors.push(`${template.id} has no acceptance criteria`);
    if (!template.recommendedOwnerRole) errors.push(`${template.id} has no owner role`);
  }
  for (const template of templates) {
    for (const next of template.nextGoalHints) if (!ids.has(next) && !["update-opportunity-state"].includes(next)) errors.push(`${template.id} references unavailable next Goal ${next}`);
  }
  return { valid: errors.length === 0, errors, goalIds: [...ids] };
}
