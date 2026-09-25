import type { GoalTemplate } from "./founderos-content/index.js";
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

export const founderOsWorkforce = [
  { key: "evidence", name: "Evidence Steward", title: "Evidence / Validation", roleAliases: ["evidence"] },
  { key: "market", name: "Market Analyst", title: "Market / ICP Research", roleAliases: ["market"] },
  { key: "customer", name: "Customer Researcher", title: "Customer Discovery / Value", roleAliases: ["customer", "research"] },
  { key: "experiment", name: "Growth Experimenter", title: "Offer / Demand Experiments", roleAliases: ["experiment"] },
  { key: "sales", name: "Commercial Lead", title: "Prospecting / Commercial Commitment", roleAliases: ["prospect", "sales"] },
  { key: "product", name: "Product Lead", title: "Usage / Retention / Strategy", roleAliases: ["product", "strategy"] },
  { key: "engineering", name: "Product Engineer", title: "MVP Reliability", roleAliases: ["engineering"] },
  { key: "finance", name: "Finance Lead", title: "Economics / Financial Planning", roleAliases: ["finance"] },
  { key: "business", name: "Business Case Architect", title: "Business Model / Plan / Pitch", roleAliases: ["business model architect", "business plan editor", "pitch-agent"] },
  { key: "content", name: "Content & GTM Lead", title: "Content / GTM / Crowdfunding", roleAliases: ["content", "crowdfunding"] },
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
