export const JULES_PROMPT_VERSION = "founderos.jules-session/v1" as const;

export type ExternalActionPolicy = "DENIED" | "APPROVAL_REQUIRED" | "PREAUTHORIZED";
export type LinearMode = "NONE" | "CREATE_PROJECT" | "CONTINUE_PROJECT";

export interface JulesSessionSpec {
  version: typeof JULES_PROMPT_VERSION;
  company: { id: string; name: string; repository: string };
  paperclip: { runId: string; agentId: string; projectId?: string; goalId?: string; outcomeId?: string };
  role: { slug: string; title: string; description: string };
  execution: { source: string; startingBranch: string; requirePlanApproval: boolean };
  capabilities: string[];
  writeScope: string[];
  linear: { mode: LinearMode; projectId?: string };
  objective: string;
  inputs: string[];
  requiredOutputs: string[];
  acceptanceCriteria: string[];
  cannotCompleteIf: string[];
  externalActions: ExternalActionPolicy;
  managerNotes?: string;
  support?: {
    skills: string[];
    packs: Array<{ id: string; version: string; purpose: string; readPaths: string[]; sourceGuidance?: string; qualityGates: string[] }>;
    missingRequiredPacks: string[];
  };
}

export interface JulesOutcomeTemplate {
  id: string;
  title: string;
  role: JulesSessionSpec["role"];
  objective: string;
  requiredOutputs: string[];
  acceptanceCriteria: string[];
  cannotCompleteIf: string[];
  writeScope: string[];
  capabilities: string[];
}

const outcome = (template: JulesOutcomeTemplate) => template;
export const JULES_OUTCOME_TEMPLATES = {
  bootstrap: outcome({ id: "bootstrap", title: "Bootstrap company model", role: { slug: "company-bootstrap", title: "Company Model Architect", description: "Turn the imported repository seed into coherent FounderOS state without inventing facts." }, objective: "Build the initial queryable company model and cheapest evidence-first validation sequence.", requiredOutputs: ["company/OVERVIEW.md", "company/VENTURE_THESIS.md", "firm/company.firm", "firm/strategy.firm", "business-case/VALIDATION_PIPELINE.md"], acceptanceCriteria: ["Overview and website disagreements are reported", "Unknown facts are assumptions or hypotheses", "firm build passes"], cannotCompleteIf: ["The repository seed cannot be read", "Firm validation fails"], writeScope: ["company/**", "firm/**", "business-case/VALIDATION_PIPELINE.md", ".founderos/**"], capabilities: ["firm"] }),
  venture_thesis: outcome({ id: "venture_thesis", title: "Venture thesis", role: { slug: "venture-strategist", title: "Venture Strategist", description: "Define the falsifiable venture thesis and its material assumptions." }, objective: "Produce a narrow, testable venture thesis grounded only in known evidence.", requiredOutputs: ["company/VENTURE_THESIS.md", "firm/strategy.firm", "business-case/ASSUMPTION_REGISTER.md"], acceptanceCriteria: ["Claims are status-labelled", "Existential assumptions are explicit", "firm build passes"], cannotCompleteIf: ["The offer or customer is impossible to identify"], writeScope: ["company/VENTURE_THESIS.md", "firm/strategy.firm", "business-case/ASSUMPTION_REGISTER.md"], capabilities: ["firm"] }),
  market_research: outcome({ id: "market_research", title: "Market research", role: { slug: "market-researcher", title: "Market Researcher", description: "Collect attributable external evidence and distinguish it from estimates." }, objective: "Assess the market, alternatives, trends, and blockers using cited sources.", requiredOutputs: ["business-case/MARKET_ANALYSIS.md", "evidence/research/**", "firm/market.firm"], acceptanceCriteria: ["Every external claim has a source", "Estimates show their calculation", "firm build passes"], cannotCompleteIf: ["Material claims lack attributable sources"], writeScope: ["business-case/MARKET_ANALYSIS.md", "evidence/research/**", "firm/market.firm"], capabilities: ["firm", "context7"] }),
  icp: outcome({ id: "icp", title: "Ideal customer profile", role: { slug: "customer-strategist", title: "Customer Strategist", description: "Narrow the customer segment and jobs-to-be-done from evidence." }, objective: "Define a reachable ICP, problem, trigger, and disqualifiers.", requiredOutputs: ["business-case/CUSTOMER_PROBLEM_REPORT.md", "firm/customers.firm"], acceptanceCriteria: ["ICP is narrow and operationally findable", "Evidence and hypotheses are distinct", "firm build passes"], cannotCompleteIf: ["No plausible reachable segment exists"], writeScope: ["business-case/CUSTOMER_PROBLEM_REPORT.md", "firm/customers.firm"], capabilities: ["firm"] }),
  prospects: outcome({ id: "prospects", title: "Prospect universe", role: { slug: "prospect-researcher", title: "Prospect Researcher", description: "Build a compliant, ICP-matched prospect universe without performing outreach." }, objective: "Create a qualified prospect set and sourcing rationale.", requiredOutputs: ["firm/leads.firm", "evidence/outreach/PROSPECT_METHODOLOGY.md"], acceptanceCriteria: ["Prospects match explicit ICP criteria", "Private or sensitive data is excluded", "firm build passes"], cannotCompleteIf: ["Collection would violate policy or terms"], writeScope: ["firm/leads.firm", "evidence/outreach/**"], capabilities: ["firm"] }),
  interviews: outcome({ id: "interviews", title: "Customer interviews", role: { slug: "customer-interviewer", title: "Customer Interview Analyst", description: "Prepare and synthesize interviews without fabricating conversations." }, objective: "Capture customer problem evidence, language, and contradictions.", requiredOutputs: ["evidence/interviews/**", "firm/interactions.firm", "business-case/CUSTOMER_PROBLEM_REPORT.md"], acceptanceCriteria: ["Only real conversations are customer evidence", "Quotes retain provenance", "firm build passes"], cannotCompleteIf: ["No interviews were actually supplied or authorized"], writeScope: ["evidence/interviews/**", "firm/interactions.firm", "business-case/CUSTOMER_PROBLEM_REPORT.md"], capabilities: ["firm"] }),
  offer: outcome({ id: "offer", title: "Offer variants", role: { slug: "offer-designer", title: "Offer Designer", description: "Create testable offers from validated customer language." }, objective: "Develop differentiated offer variants and measurable response hypotheses.", requiredOutputs: ["business-case/POSITIONING_CASE.md", "firm/experiments.firm"], acceptanceCriteria: ["Each offer maps to an ICP problem", "Success and failure thresholds are defined", "firm build passes"], cannotCompleteIf: ["Offer claims require unsupported proof"], writeScope: ["business-case/POSITIONING_CASE.md", "firm/experiments.firm"], capabilities: ["firm"] }),
  content: outcome({ id: "content", title: "Content packages", role: { slug: "content-producer", title: "Validation Content Producer", description: "Produce channel-specific validation assets, not vanity content." }, objective: "Create content packages that test a defined problem or offer hypothesis.", requiredOutputs: ["experiments/content/**", "firm/experiments.firm"], acceptanceCriteria: ["Every asset maps to an experiment", "Tracking and decision thresholds exist", "firm build passes"], cannotCompleteIf: ["Publishing authorization is absent"], writeScope: ["experiments/content/**", "firm/experiments.firm"], capabilities: ["firm"] }),
  channel_test: outcome({ id: "channel_test", title: "Channel test", role: { slug: "channel-experimenter", title: "Channel Experimenter", description: "Design compliant channel experiments and preserve behavioral evidence." }, objective: "Test whether the ICP can be reached repeatably through a specific channel.", requiredOutputs: ["evidence/experiments/**", "business-case/GTM_PLAN.md", "firm/experiments.firm"], acceptanceCriteria: ["Metrics and thresholds are predeclared", "Observed results are preserved", "firm build passes"], cannotCompleteIf: ["External action approval is missing"], writeScope: ["evidence/experiments/**", "business-case/GTM_PLAN.md", "firm/experiments.firm"], capabilities: ["firm", "tinybird"] }),
  fake_door: outcome({ id: "fake_door", title: "Fake-door experiment", role: { slug: "fake-door-builder", title: "Fake-door Experiment Builder", description: "Implement an instrumented static offer test without implying an unavailable product exists." }, objective: "Deploy a measurable fake-door or landing-page demand experiment.", requiredOutputs: ["website/**", "experiments/**", "evidence/experiments/**"], acceptanceCriteria: ["Static site builds", "Disclosure is truthful", "Conversion instrumentation works", "firm build passes"], cannotCompleteIf: ["The page misrepresents product availability", "Tracking cannot be verified"], writeScope: ["website/**", "experiments/**", "evidence/experiments/**", "firm/experiments.firm"], capabilities: ["firm", "stitch", "tinybird"] }),
  commitment: outcome({ id: "commitment", title: "Calls, LOIs, or deposits", role: { slug: "commitment-analyst", title: "Commitment Analyst", description: "Measure willingness to commit while enforcing approval gates for external actions." }, objective: "Test strong intent through calls, LOIs, deposits, or meaningful pilots.", requiredOutputs: ["evidence/sales/**", "firm/opportunities.firm", "business-case/DEMAND_EXPERIMENT_REPORT.md"], acceptanceCriteria: ["Commitments are independently verifiable", "External actions were authorized", "firm build passes"], cannotCompleteIf: ["No authorized commitment mechanism exists"], writeScope: ["evidence/sales/**", "firm/opportunities.firm", "business-case/DEMAND_EXPERIMENT_REPORT.md"], capabilities: ["firm", "linear"] }),
  concierge: outcome({ id: "concierge", title: "Concierge delivery", role: { slug: "concierge-operator", title: "Concierge Delivery Operator", description: "Deliver the customer outcome manually before automating it." }, objective: "Test whether the promised outcome can be delivered and valued without a full product build.", requiredOutputs: ["evidence/experiments/**", "business-case/DELIVERY_REPORT.md", "firm/interactions.firm"], acceptanceCriteria: ["Delivery and effort are measured", "Customer outcome is recorded", "firm build passes"], cannotCompleteIf: ["Delivery requires an unauthorized sensitive action"], writeScope: ["evidence/experiments/**", "business-case/DELIVERY_REPORT.md", "firm/interactions.firm"], capabilities: ["firm", "linear"] }),
  retention: outcome({ id: "retention", title: "Retention and repeat", role: { slug: "retention-analyst", title: "Retention Analyst", description: "Evaluate repeat behavior and ongoing value from observed use." }, objective: "Determine whether customers repeat, retain, or request continued delivery.", requiredOutputs: ["business-case/RETENTION_REPORT.md", "evidence/experiments/**", "firm/evidence.firm"], acceptanceCriteria: ["Retention claims use observed cohorts", "Missing follow-up is not treated as retention", "firm build passes"], cannotCompleteIf: ["No elapsed repeat-use window exists"], writeScope: ["business-case/RETENTION_REPORT.md", "evidence/experiments/**", "firm/evidence.firm"], capabilities: ["firm", "tinybird"] }),
  economics: outcome({ id: "economics", title: "Unit economics", role: { slug: "economics-analyst", title: "Unit Economics Analyst", description: "Calculate economics with transparent inputs and sensitivity ranges." }, objective: "Assess plausible acquisition, delivery, margin, and payback economics.", requiredOutputs: ["business-case/BUSINESS_MODEL_CANVAS.md", "business-case/ECONOMICS.md", "firm/strategy.firm"], acceptanceCriteria: ["Every number is evidence or a labelled assumption", "Sensitivity cases are included", "firm build passes"], cannotCompleteIf: ["A required input has neither evidence nor an explicit assumption range"], writeScope: ["business-case/BUSINESS_MODEL_CANVAS.md", "business-case/ECONOMICS.md", "firm/strategy.firm"], capabilities: ["firm"] }),
  red_team: outcome({ id: "red_team", title: "Red-team validation gate", role: { slug: "investment-committee", title: "Validation Red Team", description: "Challenge the case, identify fatal gaps, and recommend BUILD, ITERATE, PIVOT, or KILL." }, objective: "Produce a conservative validation decision from the claim/evidence record.", requiredOutputs: ["business-case/CLAIM_EVIDENCE_LEDGER.md", "business-case/REQUIREMENTS_MATRIX.md", "business-case/INVESTMENT_COMMITTEE_DECISION.md", "company/DECISION_LOG.md"], acceptanceCriteria: ["Contrary evidence is included", "Every gate cites underlying records", "Decision follows deterministic failures", "firm build passes"], cannotCompleteIf: ["Evidence provenance is missing", "Mandatory deterministic checks fail"], writeScope: ["business-case/**", "company/DECISION_LOG.md", "firm/decisions.firm"], capabilities: ["firm"] }),
} as const;

const bullets = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None supplied";

export function renderJulesPrompt(spec: JulesSessionSpec): string {
  if (spec.version !== JULES_PROMPT_VERSION) throw new Error(`Unsupported Jules prompt version: ${spec.version}`);
  return `# FounderOS Execution Assignment

You are Jules acting as **${spec.role.title}** for **${spec.company.name}**.
This is Paperclip run \`${spec.paperclip.runId}\`.

Organizational identifiers:
- Company: \`${spec.company.id}\`
- Agent: \`${spec.paperclip.agentId}\`
- Project: \`${spec.paperclip.projectId ?? "none"}\`
- Goal: \`${spec.paperclip.goalId ?? "none"}\`
- Outcome: \`${spec.paperclip.outcomeId ?? "none"}\`
- Repository: \`${spec.company.repository}\`
- Source: \`${spec.execution.source}\`

## Mandatory startup
1. Read \`/AGENTS.md\`.
2. Read \`/.founderos/JULES_CONTEXT.md\`, \`PAPERCLIP_API.md\`, \`TOOL_POLICY.md\`, and \`DEPLOYMENT_POLICY.md\`.
3. Read task inputs and existing Firm state.
4. Run \`firm build\` before material work.
5. Fetch authoritative live run context from Paperclip.
6. Report repository/live-context conflicts. Never expose environment secrets.

## Role
${spec.role.description}
The role does not expand authority beyond this outcome contract.

## Objective
${spec.objective}

## Inputs
${bullets(spec.inputs)}

## Required outputs
${bullets(spec.requiredOutputs)}

## Acceptance criteria
${bullets(spec.acceptanceCriteria)}

## Cannot complete if
${bullets(spec.cannotCompleteIf)}
Do not convert a blocker into an assumption merely to finish.

## Planning
Linear mode: **${spec.linear.mode}**${spec.linear.projectId ? ` (project ${spec.linear.projectId})` : ""}.
Use Linear for meaningful detailed decomposition. Promote only blockers, approvals, milestones, strategic workstreams, and completion candidates to Paperclip.

## Company and evidence state
GitHub is the durable workspace. Firm is structured company state. Evidence belongs in \`evidence/\`; experiments in \`experiments/\`; synthesized artifacts in \`business-case/\`; customer-facing work in \`website/\`.
Generated analysis is not market evidence. Label every material claim as evidence, external source, customer evidence, calculated estimate, founder assumption, or hypothesis.

## Tools and deployment
Required capabilities: ${spec.capabilities.join(", ") || "firm"}.
Use Context7 for current API behavior, Stitch for specified design work, Tinybird only for analytics, and Linear when enabled. Do not add Supabase, Neon, Postgres, or another company-state database. Render Static is only for static sites; services target Hugging Face Spaces.

## Goal-specific support
Required reasoning skills: ${spec.support?.skills.length ? spec.support.skills.join(", ") : "None"}.
${spec.support?.packs.length ? spec.support.packs.map((pack) => `### ${pack.id}@${pack.version}\n${pack.purpose}\nRead before beginning:\n${bullets(pack.readPaths.map((path) => `\`${path}\``))}\n${pack.sourceGuidance ? `Source guidance: ${pack.sourceGuidance}\n` : ""}Quality gates:\n${bullets(pack.qualityGates)}`).join("\n\n") : "No support packs attached."}
${spec.support?.missingRequiredPacks.length ? `STOP: required support packs are unavailable: ${spec.support.missingRequiredPacks.join(", ")}. Report a blocker; do not proceed.` : "All required support packs are resolved."}
Use support packs as method/layout/schema guidance. Never copy example claims, traction, or business data from them.

## External actions
Policy: **${spec.externalActions}**.
Stop before any unapproved publishing, outreach, payment, account, spend, destructive, sensitive-data, or irreversible action and report the approval request to Paperclip.

## Git and PR discipline
Write only within: ${spec.writeScope.map((path) => `\`${path}\``).join(", ")}.
Do not merge your own PR and do not mark your own outcome accepted.

## Completion protocol
1. Inspect the actual artifacts and run relevant tests.
2. Run \`firm build\` after changes; completion is forbidden if it fails.
3. Verify every required output and acceptance criterion.
4. Identify unresolved requirements and check Git history for secrets.
5. Submit an idempotent completion candidate to Paperclip with the PR URL and artifact paths.

A Jules COMPLETED state is only a completion candidate. Paperclip performs deterministic validation and Hermes supervisory review.

## Session economy
Continue this session for revisions whenever practical. Do not create follow-on sessions. Remaining new-session budget: **0**.

## Manager notes
${spec.managerNotes?.trim() || "None."}`;
}

export function createJulesSessionSpec(input: Omit<JulesSessionSpec, "version">): JulesSessionSpec {
  return { version: JULES_PROMPT_VERSION, ...input };
}
