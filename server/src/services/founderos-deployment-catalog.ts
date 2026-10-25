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
export type WorkforceBackend = "jules" | "hermes_local";

export interface WorkforceMember {
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly roleAliases: readonly string[];
  /** Capability tokens into the adapter's MCP registry. */
  readonly mcp: readonly string[];
  /** Goal template IDs this role owns or materially contributes to. */
  readonly goals: readonly string[];
  /**
   * Where the role runs, and it is a capability question rather than a preference.
   *
   * A Jules session is created on Google's infrastructure with a prompt and a repository
   * source and nothing else — `createSession` takes no environment — so it cannot hold this
   * deployment's credentials. Anything that needs a bearer token this deployment owns (the
   * Agent Dashboards key, for instance) has to run locally under Hermes. Everything that
   * needs the repository checked out and a pull request at the end is the opposite case.
   * Getting this backwards does not fail loudly: the agent just reports a wall it cannot get
   * past, run after run.
   */
  readonly backend?: WorkforceBackend;
  /**
   * Stem of a vendored persona under `resources/agency-profiles/`, rendered into the dispatch
   * prompt as craft guidance only. Optional: the original FounderOS roles have no persona.
   */
  readonly agencyProfile?: string;
  /**
   * Keys to ask first when this role needs another role to finish part of its job. Advisory:
   * the handoff service lets any role ask any peer, because a routing list that turns out to
   * be wrong should mis-rank a request, not strand it.
   */
  readonly askFirst?: readonly string[];
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

  // --- Persona-backed roles (vendored profiles in resources/agency-profiles/) -------------
  //
  // Aliases below are chosen so none of them equals a goal template's recommendedOwnerRole
  // ("business model architect", "business plan editor", "crowdfunding", "finance",
  // "pitch-agent", "product", "prospect", "research", "sales", "strategy"). ownerFor() matches
  // whole aliases and takes the first hit, so an alias that duplicated an owner role would
  // silently reassign that owner's goals depending on array order. Keep it that way when adding
  // a role, and re-run the ownership audit rather than assuming.

  // Hermes, not Jules: only a locally-run agent is handed DASHBOARD_API_KEY, because a Jules
  // session cannot receive environment variables. This role is the presentation surface the
  // founder looks at, so it must be able to authenticate.
  { key: "presentationalist", name: "Data Presentationalist", title: "Dashboards / Document Visuals", roleAliases: ["presentationalist", "dashboard", "visualisation", "visualization"], mcp: ["dashboard"], goals: ["observe-product-usage", "compile-business-plan", "compile-pitch"], backend: "hermes_local", agencyProfile: "engineering-data-visualization-engineer", askFirst: ["finance", "experiment", "business"] },
  { key: "pdf", name: "PDF Engine Architect", title: "Deterministic PDF Compilation", roleAliases: ["pdf-engine", "pdf-architect"], mcp: ["context7"], goals: ["bpw-business-plan", "compile-business-plan", "bpw-pitch", "compile-pitch"], agencyProfile: "engineering-pdf-engine-architect", askFirst: ["docs", "business", "presentationalist"] },
  { key: "docs", name: "Document Compiler", title: "Business Plan / Proposal Documentation", roleAliases: ["documentation", "document-compiler"], mcp: ["context7", "linear"], goals: ["bpw-business-plan", "compile-business-plan", "business-model", "compile-business-model-canvas"], agencyProfile: "engineering-universal-document-compiler", askFirst: ["business", "presentationalist", "pdf"] },
  { key: "deal", name: "Deal Strategist", title: "Qualification / Win Planning", roleAliases: ["deal-strategist", "meddpicc"], mcp: ["linear"], goals: ["validate-commercial-commitment", "build-prospect-universe"], agencyProfile: "sales-deal-strategist", askFirst: ["sales", "proposal", "discovery"] },
  { key: "discovery", name: "Discovery Coach", title: "Interview Design / Call Structure", roleAliases: ["discovery-coach", "interview-coach"], mcp: ["linear"], goals: ["validate-problem", "define-initial-icp"], agencyProfile: "sales-discovery-coach", askFirst: ["customer", "deal"] },
  { key: "proposal", name: "Proposal Strategist", title: "Proposal Narrative / Win Themes", roleAliases: ["proposal-strategist", "rfp"], mcp: ["linear", "context7"], goals: ["validate-commercial-commitment", "bpw-pitch", "compile-pitch"], agencyProfile: "sales-proposal-strategist", askFirst: ["deal", "business", "docs"] },
  { key: "reddit", name: "Reddit Community Builder", title: "Community Research / Value-First Drafts", roleAliases: ["reddit", "community"], mcp: ["context7"], goals: ["validate-problem", "content-distribution"], agencyProfile: "marketing-reddit-community-builder", askFirst: ["content", "market"] },
  { key: "seo", name: "SEO Specialist", title: "Technical SEO / Keyword Research", roleAliases: ["seo", "search"], mcp: ["context7", "v0"], goals: ["content-distribution", "analyze-market"], agencyProfile: "marketing-seo-specialist", askFirst: ["content", "market", "engineering"] },
  { key: "nudge", name: "Behavioral Nudge Engine", title: "Activation / Cadence Design", roleAliases: ["nudge", "behavioral"], mcp: ["tinybird", "stitch"], goals: ["validate-retention", "observe-product-usage", "validate-value-realization"], agencyProfile: "product-behavioral-nudge-engine", askFirst: ["product", "experiment", "presentationalist"] },
  { key: "sprint", name: "Sprint Prioritizer", title: "Sequencing / Capacity / Dependencies", roleAliases: ["sprint", "prioritizer"], mcp: ["linear", "tinybird"], goals: ["maintain-mvp-reliability", "observe-product-usage"], agencyProfile: "product-sprint-prioritizer", askFirst: ["product", "engineering", "finance"] },
] as const;

/**
 * The catalog entry behind a bootstrapped agent.
 *
 * Bootstrap stores `founderosTemplateId` as the comma-joined "key,alias,alias" string, and the
 * key is always first, so an agent row can be traced back to the role that declared its persona
 * and routing hints without a second lookup table to fall out of step.
 */
export function workforceEntryForTemplateId(templateId: unknown): WorkforceMember | undefined {
  const key = String(templateId ?? "").split(",")[0]?.trim();
  return key ? founderOsWorkforce.find((member) => member.key === key) : undefined;
}

/** Roles that run locally and therefore may hold this deployment's credentials. */
export function localWorkforceMembers(workforce: readonly WorkforceMember[] = founderOsWorkforce) {
  return workforce.filter((member) => (member.backend ?? "jules") === "hermes_local");
}

/** Every declared capability token, for validating against the adapter's MCP registry. */
export function declaredCapabilities(workforce: readonly WorkforceMember[] = founderOsWorkforce) {
  return [...new Set(workforce.flatMap((member) => [...member.mcp]))];
}

export function validateDeploymentCatalog(templates = founderOsDeploymentGoalTemplates, workforce: readonly WorkforceMember[] = founderOsWorkforce) {
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
  // These four checks guard the invariants that fail silently. Bootstrap throws on any error
  // here, so a mistake is caught at company import rather than as an agent reporting a wall,
  // or as a goal quietly reassigned to the wrong role.
  const keys = new Set<string>();
  const aliases = new Map<string, string>();
  for (const member of workforce) {
    if (keys.has(member.key)) errors.push(`Duplicate workforce key ${member.key}`);
    keys.add(member.key);
    for (const alias of new Set([member.key, ...member.roleAliases])) {
      // Two roles claiming one name: ownerFor() and handoff role resolution both take the first
      // match, so which agent receives the work depends on row order. That is the class of bug
      // that reassigned `validate-value-realization` once already.
      const owner = aliases.get(alias);
      if (owner && owner !== member.key) errors.push(`Role alias "${alias}" claimed by both ${owner} and ${member.key}`);
      aliases.set(alias, member.key);
    }
    for (const capability of member.mcp) if (!(capability in MCP_SERVERS)) errors.push(`${member.key} declares unknown MCP capability ${capability}`);
    for (const peer of member.askFirst ?? []) if (!workforce.some((other) => other.key === peer) && peer !== "founder-manager") errors.push(`${member.key} askFirst references unknown role ${peer}`);
  }
  // Every Goal owner role must resolve to exactly one role, checked as uniqueness rather than
  // "is not an alias anywhere": owner roles legitimately ARE aliases of the role that owns them
  // (`finance`, `product`, `sales`), so forbidding overlap outright would flag the roles that are
  // correctly registered. Zero matches means bootstrap silently falls back to the first worker;
  // several means the owner is decided by row order.
  for (const template of templates) {
    if (!template.recommendedOwnerRole) continue;
    const owners = workforce.filter((member) => member.key === template.recommendedOwnerRole || member.roleAliases.includes(template.recommendedOwnerRole));
    if (owners.length === 0) errors.push(`Goal ${template.id} owner role "${template.recommendedOwnerRole}" matches no workforce role and would fall back to ${workforce[0]?.key ?? "nobody"}`);
    if (owners.length > 1) errors.push(`Goal ${template.id} owner role "${template.recommendedOwnerRole}" matches ${owners.map((o) => o.key).join(", ")}`);
  }
  return { valid: errors.length === 0, errors, goalIds: [...ids] };
}
