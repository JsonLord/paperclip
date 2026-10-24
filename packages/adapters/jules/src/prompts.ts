export const JULES_PROMPT_VERSION = "founderos.jules-session/v1" as const;

/**
 * Default home of per-role reference material.
 *
 * Exported for the bootstrap writer, which owns the path the agent is told to read. The prompt
 * deliberately does not fall back to it: an agent that was never given a resource path gets
 * no pointer rather than a pointer at a folder nobody wrote.
 */
export const DEFAULT_RESOURCE_ROOT = ".paperclip/resources";

/**
 * The MCP servers a FounderOS deployment knows about, keyed by the capability token
 * used in outcome templates, goal `requiredCapabilities`, and Jules profile grants.
 *
 * The key is the contract; `name` is only how the server is addressed in prose. They
 * deliberately differ for `stitch`, which is the token every existing profile, goal and
 * template already carries, while the product is called Stitch.
 *
 * Stitch and v0 are different products solving different halves of the same job, and an
 * agent that conflates them will reach for the wrong one:
 *   - Stitch (Google) produces design artifacts — screens, layouts, visual direction.
 *   - v0 (Vercel) produces shippable React/Tailwind code that goes in `website/`.
 * A fake-door test needs a design first and code second, so `fake_door` declares both.
 */
export interface McpServerGuide {
  name: string;
  /** One-line statement of when to reach for it, rendered into the dispatch prompt. */
  use: string;
  /** Goals this server materially advances, for the agent's own resource doc. */
  goals: string[];
  /** Concrete procedure, written to the resource doc rather than every prompt. */
  howTo: string[];
  /** Limits that stop the agent reaching for it too early. */
  cautions: string[];
  /**
   * True when only a locally-run agent can use this at all.
   *
   * Creating a Jules session takes a prompt and a repository source and nothing else, so a
   * remote worker cannot be given this deployment's bearer tokens. Advertising such a
   * capability in a Jules prompt does not grant it — it produces a confident agent that
   * reports an impassable wall, run after run. Remote dispatch omits these entirely.
   */
  localOnly?: boolean;
}

export const MCP_SERVERS: Record<string, McpServerGuide> = {
  stitch: {
    name: "Stitch",
    use: "design generation for offer surfaces — landing pages, pricing screens, and the visual direction of a fake-door test",
    goals: ["validate-offer", "validate-demand", "compile-pitch", "content-distribution", "kickstarter-crowdfunding"],
    howTo: [
      "Prompt for the decision the page has to support, not for \"a nice landing page\": name the ICP, the promised outcome, and the single action the visitor should take.",
      "Ask for the variants you intend to test against each other, so the design and the experiment share a shape.",
      "Take the design forward to v0 for implementation instead of hand-coding a layout the design already settled.",
      "Record which design produced which variant under `experiments/`, and cite it when reporting results.",
    ],
    cautions: [
      "A designed page is not a delivered one. Stitch output is a candidate until it builds and instruments in `website/`.",
      "Never let a render imply a capability that does not exist. What the page promises must fit what can actually be honoured; the disclosure line is part of the design.",
    ],
  },
  v0: {
    name: "v0 by Vercel",
    use: "React/Tailwind implementation of an approved design — the code that actually ships under `website/`",
    goals: ["validate-offer", "validate-demand", "content-distribution", "kickstarter-crowdfunding"],
    howTo: [
      "Generate from an accepted Stitch design or an existing `website/` component, so the code inherits a settled layout.",
      "Keep it static. A fake-door test needs a form target and an event, not a backend.",
      "Verify the conversion event fires before reporting a single observation; an untracked page yields a result that is not a result.",
    ],
    cautions: [
      "Do not scaffold authentication, payments, or persistence to make a page feel real. Those imply a product the company does not have.",
    ],
  },
  context7: {
    name: "Context7",
    use: "current, version-specific library documentation and code examples",
    goals: ["analyze-market", "define-initial-icp", "validate-problem", "maintain-mvp-reliability", "compile-business-plan"],
    howTo: [
      "Query before writing code against any library, and pin the version the repository actually uses.",
      "Cite library behaviour as an external source with the version and URL, not as reasoning.",
      "When an integration decision is load-bearing for feasibility, save the fetched excerpt under `evidence/research/`.",
    ],
    cautions: [
      "It answers how a library behaves, not whether anyone wants the product. It is not a market-evidence source.",
    ],
  },
  linear: {
    name: "Linear",
    use: "issue tracking and detailed work decomposition behind a Paperclip outcome",
    goals: ["validate-commercial-commitment", "validate-value-realization", "observe-product-usage", "build-prospect-universe", "bpw-business-plan"],
    howTo: [
      "Decompose the outcome into issues in Linear; keep Paperclip holding only blockers, approvals, milestones, and completion candidates.",
      "For pilots and LOIs, one issue per commitment recording who, what, when, and the evidence link.",
      "Link every Linear issue back to the Paperclip run id so the record reconciles.",
    ],
    cautions: [
      "Linear is planning state, not company state. A business fact that must survive lives in `firm/`, not in an issue.",
      "Respect the Linear mode on this dispatch; `NONE` means do not create a project.",
    ],
  },
  tinybird: {
    name: "Tinybird",
    use: "real-time analytics over experiment traffic — impressions, clicks, signups, cohorts",
    goals: ["validate-demand", "validate-retention", "validate-value-realization", "observe-product-usage", "analyze-unit-economics"],
    howTo: [
      "Declare the metric and decision threshold in the experiment record before reading any number, then query to that definition.",
      "Report the denominator next to the rate; a conversion percentage without traffic volume is unusable.",
      "Attach the query or result snapshot under `evidence/experiments/` so another person can reproduce it.",
    ],
    cautions: [
      "Traffic is not demand and a click is not commitment. Report what the event means and what it cannot support.",
      "Never invent a figure to fill a gap the pipeline does not cover — say the measurement is missing.",
    ],
  },
  neon: {
    name: "Neon",
    use: "disposable serverless Postgres for transient experiment data",
    goals: ["validate-demand", "maintain-mvp-reliability", "observe-product-usage"],
    howTo: [
      "Branch per experiment, and write the branch name into the experiment record.",
      "Hold only event data: signups, clicks, form submissions, and their timestamps.",
    ],
    cautions: [
      "Never a source of truth for a business fact. Anything that must survive rolls up into `firm/` and `business-case/`.",
      "No real customer personal data without explicit founder approval.",
    ],
  },
  supabase: {
    name: "Supabase",
    use: "serverless Postgres plus Edge Functions for a lightweight capture endpoint",
    goals: ["validate-demand", "maintain-mvp-reliability", "kickstarter-crowdfunding"],
    howTo: [
      "An Edge Function may receive a waitlist or interest submission and record it. That is the whole scope.",
      "Record the endpoint path and its event schema in the experiment record.",
    ],
    cautions: [
      "Not application infrastructure. Deploying an Edge Function is an external effect and needs approval.",
      "Never a source of truth for a business fact; company state stays in GitHub and `firm/`.",
    ],
  },
  /**
   * The Agent Dashboards service. Listed here rather than in a separate table so a role's
   * grant, its resource guide, and the manager's routing view all come from one place, even
   * though it is an HTTP API reached with curl rather than an MCP server in the transport
   * sense. `localOnly` is what makes that honest.
   */
  dashboard: {
    name: "Agent Dashboards",
    use: "publishing what the company did and what its metrics say, as dashboards the founder reads",
    goals: ["observe-product-usage", "compile-business-plan", "compile-pitch"],
    localOnly: true,
    howTo: [
      "Read the dashboard before writing it: GET /api/dashboards/{id} with the bearer key already in your shell.",
      "Create the layout once with POST /api/dashboards (the body must include \"id\"), then refresh content with PUT /api/dashboards/{id}/data. A data PUT replaces each key you send whole and leaves every other key untouched.",
      "Bullets are table widgets, one row each. A text widget renders inside a plain <div>, so newlines collapse in the browser and a list becomes one run-on sentence.",
      "Finish with POST /api/sync. Durable backup otherwise runs once a day, and an unsynced report is a report that did not happen.",
    ],
    cautions: [
      "Only a locally-run agent holds the key. If you are reading this in a remote session you have no credential: say the update needs the reporting agent instead of trying and failing.",
      "A dashboard is a claim to the founder. Every figure needs its denominator and every unverified line says it is unverified.",
    ],
  },
};

/** Capability token -> guide, falling back to a bare mention for an unknown token. */
export function mcpGuide(capability: string): { name: string; use: string } {
  const guide = MCP_SERVERS[capability];
  return guide ? { name: guide.name, use: guide.use } : { name: capability, use: "declared for this outcome" };
}

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
  /**
   * The Paperclip issue this session was dispatched for. The outcome template alone says
   * what kind of work the role does; without this the worker only ever receives the
   * template's generic objective and has no way to learn which issue it was woken for,
   * because it runs on Google's infrastructure and holds no Paperclip credential.
   */
  assignment?: { title: string; description?: string; priority?: string; goal?: string };
  managerNotes?: string;
  /**
   * Where this agent's own reference material lives in the repository — its MCP guide and
   * the founder-supplied templates it must orient against. Absolute from the repository
   * root so the worker can read it without guessing at a layout.
   */
  resourcePath?: string;
  /**
   * A rendered persona section, supplied by the server because the persona files live in this
   * deployment's resources and a remote worker has no way to read them.
   *
   * It arrives as finished markdown rather than as a key to look up: the adapter must not know
   * where personas are stored, and a worker must not be able to name an arbitrary file to have
   * its contents pasted into its own prompt.
   */
  persona?: string;
  /**
   * Asking a peer for part of the job: who to ask, and where to leave the request.
   *
   * The roster is rendered in rather than fetched, because a Jules worker holds no Paperclip
   * credential and cannot call a peers endpoint. Telling it to discover the fleet it is
   * allowed to address would produce guessed role names and rejected requests.
   */
  handoff?: { outboxDir: string; askFirst: string[]; peers: Array<{ askKey: string; name: string; title?: string; available?: boolean; note?: string }> };
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
  bootstrap: outcome({ id: "bootstrap", title: "Bootstrap company model", role: { slug: "company-bootstrap", title: "Company Model Architect", description: "Turn the imported repository seed into coherent FounderOS state without inventing facts." }, objective: "Build the initial queryable company model and cheapest evidence-first validation sequence.", requiredOutputs: ["company/OVERVIEW.md", "company/VENTURE_THESIS.md", "firm/company.firm", "firm/strategy.firm", "business-case/VALIDATION_PIPELINE.md"], acceptanceCriteria: ["Overview and website disagreements are reported", "Unknown facts are assumptions or hypotheses", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["The repository seed cannot be read", "A firm file would be left malformed"], writeScope: ["company/**", "firm/**", "business-case/VALIDATION_PIPELINE.md", ".founderos/**"], capabilities: [] }),
  venture_thesis: outcome({ id: "venture_thesis", title: "Venture thesis", role: { slug: "venture-strategist", title: "Venture Strategist", description: "Define the falsifiable venture thesis and its material assumptions." }, objective: "Produce a narrow, testable venture thesis grounded only in known evidence.", requiredOutputs: ["company/VENTURE_THESIS.md", "firm/strategy.firm", "business-case/ASSUMPTION_REGISTER.md"], acceptanceCriteria: ["Claims are status-labelled", "Existential assumptions are explicit", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["The offer or customer is impossible to identify"], writeScope: ["company/VENTURE_THESIS.md", "firm/strategy.firm", "business-case/ASSUMPTION_REGISTER.md"], capabilities: [] }),
  market_research: outcome({ id: "market_research", title: "Market research", role: { slug: "market-researcher", title: "Market Researcher", description: "Collect attributable external evidence and distinguish it from estimates." }, objective: "Assess the market, alternatives, trends, and blockers using cited sources.", requiredOutputs: ["business-case/MARKET_ANALYSIS.md", "evidence/research/**", "firm/market.firm"], acceptanceCriteria: ["Every external claim has a source", "Estimates show their calculation", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["Material claims lack attributable sources"], writeScope: ["business-case/MARKET_ANALYSIS.md", "evidence/research/**", "firm/market.firm"], capabilities: ["context7"] }),
  icp: outcome({ id: "icp", title: "Ideal customer profile", role: { slug: "customer-strategist", title: "Customer Strategist", description: "Narrow the customer segment and jobs-to-be-done from evidence." }, objective: "Define a reachable ICP, problem, trigger, and disqualifiers.", requiredOutputs: ["business-case/CUSTOMER_PROBLEM_REPORT.md", "firm/customers.firm"], acceptanceCriteria: ["ICP is narrow and operationally findable", "Evidence and hypotheses are distinct", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["No plausible reachable segment exists"], writeScope: ["business-case/CUSTOMER_PROBLEM_REPORT.md", "firm/customers.firm"], capabilities: [] }),
  prospects: outcome({ id: "prospects", title: "Prospect universe", role: { slug: "prospect-researcher", title: "Prospect Researcher", description: "Build a compliant, ICP-matched prospect universe without performing outreach." }, objective: "Create a qualified prospect set and sourcing rationale.", requiredOutputs: ["firm/leads.firm", "evidence/outreach/PROSPECT_METHODOLOGY.md"], acceptanceCriteria: ["Prospects match explicit ICP criteria", "Private or sensitive data is excluded", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["Collection would violate policy or terms"], writeScope: ["firm/leads.firm", "evidence/outreach/**"], capabilities: [] }),
  interviews: outcome({ id: "interviews", title: "Customer interviews", role: { slug: "customer-interviewer", title: "Customer Interview Analyst", description: "Prepare and synthesize interviews without fabricating conversations." }, objective: "Capture customer problem evidence, language, and contradictions.", requiredOutputs: ["evidence/interviews/**", "firm/interactions.firm", "business-case/CUSTOMER_PROBLEM_REPORT.md"], acceptanceCriteria: ["Only real conversations are customer evidence", "Quotes retain provenance", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["No interviews were actually supplied or authorized"], writeScope: ["evidence/interviews/**", "firm/interactions.firm", "business-case/CUSTOMER_PROBLEM_REPORT.md"], capabilities: [] }),
  offer: outcome({ id: "offer", title: "Offer variants", role: { slug: "offer-designer", title: "Offer Designer", description: "Create testable offers from validated customer language." }, objective: "Develop differentiated offer variants and measurable response hypotheses.", requiredOutputs: ["business-case/POSITIONING_CASE.md", "firm/experiments.firm"], acceptanceCriteria: ["Each offer maps to an ICP problem", "Success and failure thresholds are defined", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["Offer claims require unsupported proof"], writeScope: ["business-case/POSITIONING_CASE.md", "firm/experiments.firm"], capabilities: [] }),
  content: outcome({ id: "content", title: "Content packages", role: { slug: "content-producer", title: "Validation Content Producer", description: "Produce channel-specific validation assets, not vanity content." }, objective: "Create content packages that test a defined problem or offer hypothesis.", requiredOutputs: ["experiments/content/**", "firm/experiments.firm"], acceptanceCriteria: ["Every asset maps to an experiment", "Tracking and decision thresholds exist", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["Publishing authorization is absent"], writeScope: ["experiments/content/**", "firm/experiments.firm"], capabilities: [] }),
  channel_test: outcome({ id: "channel_test", title: "Channel test", role: { slug: "channel-experimenter", title: "Channel Experimenter", description: "Design compliant channel experiments and preserve behavioral evidence." }, objective: "Test whether the ICP can be reached repeatably through a specific channel.", requiredOutputs: ["evidence/experiments/**", "business-case/GTM_PLAN.md", "firm/experiments.firm"], acceptanceCriteria: ["Metrics and thresholds are predeclared", "Observed results are preserved", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["External action approval is missing"], writeScope: ["evidence/experiments/**", "business-case/GTM_PLAN.md", "firm/experiments.firm"], capabilities: ["tinybird"] }),
  fake_door: outcome({ id: "fake_door", title: "Fake-door experiment", role: { slug: "fake-door-builder", title: "Fake-door Experiment Builder", description: "Implement an instrumented static offer test without implying an unavailable product exists." }, objective: "Deploy a measurable fake-door or landing-page demand experiment.", requiredOutputs: ["website/**", "experiments/**", "evidence/experiments/**"], acceptanceCriteria: ["Static site builds", "Disclosure is truthful", "Conversion instrumentation works", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["The page misrepresents product availability", "Tracking cannot be verified"], writeScope: ["website/**", "experiments/**", "evidence/experiments/**", "firm/experiments.firm"], capabilities: ["stitch", "v0", "tinybird", "supabase"] }),
  commitment: outcome({ id: "commitment", title: "Calls, LOIs, or deposits", role: { slug: "commitment-analyst", title: "Commitment Analyst", description: "Measure willingness to commit while enforcing approval gates for external actions." }, objective: "Test strong intent through calls, LOIs, deposits, or meaningful pilots.", requiredOutputs: ["evidence/sales/**", "firm/opportunities.firm", "business-case/DEMAND_EXPERIMENT_REPORT.md"], acceptanceCriteria: ["Commitments are independently verifiable", "External actions were authorized", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["No authorized commitment mechanism exists"], writeScope: ["evidence/sales/**", "firm/opportunities.firm", "business-case/DEMAND_EXPERIMENT_REPORT.md"], capabilities: ["linear"] }),
  concierge: outcome({ id: "concierge", title: "Concierge delivery", role: { slug: "concierge-operator", title: "Concierge Delivery Operator", description: "Deliver the customer outcome manually before automating it." }, objective: "Test whether the promised outcome can be delivered and valued without a full product build.", requiredOutputs: ["evidence/experiments/**", "business-case/DELIVERY_REPORT.md", "firm/interactions.firm"], acceptanceCriteria: ["Delivery and effort are measured", "Customer outcome is recorded", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["Delivery requires an unauthorized sensitive action"], writeScope: ["evidence/experiments/**", "business-case/DELIVERY_REPORT.md", "firm/interactions.firm"], capabilities: ["linear"] }),
  retention: outcome({ id: "retention", title: "Retention and repeat", role: { slug: "retention-analyst", title: "Retention Analyst", description: "Evaluate repeat behavior and ongoing value from observed use." }, objective: "Determine whether customers repeat, retain, or request continued delivery.", requiredOutputs: ["business-case/RETENTION_REPORT.md", "evidence/experiments/**", "firm/evidence.firm"], acceptanceCriteria: ["Retention claims use observed cohorts", "Missing follow-up is not treated as retention", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["No elapsed repeat-use window exists"], writeScope: ["business-case/RETENTION_REPORT.md", "evidence/experiments/**", "firm/evidence.firm"], capabilities: ["tinybird"] }),
  economics: outcome({ id: "economics", title: "Unit economics", role: { slug: "economics-analyst", title: "Unit Economics Analyst", description: "Calculate economics with transparent inputs and sensitivity ranges." }, objective: "Assess plausible acquisition, delivery, margin, and payback economics.", requiredOutputs: ["business-case/BUSINESS_MODEL_CANVAS.md", "business-case/ECONOMICS.md", "firm/strategy.firm"], acceptanceCriteria: ["Every number is evidence or a labelled assumption", "Sensitivity cases are included", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["A required input has neither evidence nor an explicit assumption range"], writeScope: ["business-case/BUSINESS_MODEL_CANVAS.md", "business-case/ECONOMICS.md", "firm/strategy.firm"], capabilities: [] }),
  red_team: outcome({ id: "red_team", title: "Red-team validation gate", role: { slug: "investment-committee", title: "Validation Red Team", description: "Challenge the case, identify fatal gaps, and recommend BUILD, ITERATE, PIVOT, or KILL." }, objective: "Produce a conservative validation decision from the claim/evidence record.", requiredOutputs: ["business-case/CLAIM_EVIDENCE_LEDGER.md", "business-case/REQUIREMENTS_MATRIX.md", "business-case/INVESTMENT_COMMITTEE_DECISION.md", "company/DECISION_LOG.md"], acceptanceCriteria: ["Contrary evidence is included", "Every gate cites underlying records", "Decision follows deterministic failures", "Firm files are edited as well-formed entity records"], cannotCompleteIf: ["Evidence provenance is missing", "Mandatory deterministic checks fail"], writeScope: ["business-case/**", "company/DECISION_LOG.md", "firm/decisions.firm"], capabilities: [] }),
} as const;

const bullets = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None supplied";

/**
 * The tools section of a dispatch prompt.
 *
 * A worker is told which servers it holds and where its written guide lives, but is not told
 * to use them. The broker treats a template's capability list as advisory for exactly this
 * reason: an earlier build that treated it as a requirement denied dispatches over tooling
 * the outcome never needed. Listing the grant plus the guide path keeps the nudge advisory.
 */
/**
 * The handoff section: how to ask a peer, and who is addressable.
 *
 * A handoff is left as a file under `.founderos/outbox/<runId>/`, not POSTed. That is not a
 * shortcut — a Jules session runs on Google's infrastructure with no Paperclip bearer token, so
 * an HTTP ask would fail on every attempt, while a repository write is the one capability it
 * definitely has. The outbox reconciler promotes the file into a native Paperclip issue assigned
 * to the peer, which then wakes, so the peer never learns or cares how the request travelled.
 */
function renderHandoffSection(spec: JulesSessionSpec): string {
  const peers = spec.handoff!.peers.filter((peer) => peer.available !== false);
  const lines = [
    "## Asking a peer for part of the job",
    "",
    "Some of this outcome may belong to another agent. Ask them instead of doing their part badly,",
    "and never invent the part you needed them for.",
    "",
    "Write one file per request into `" + spec.handoff!.outboxDir + "`:",
    "",
    "```json",
    "{",
    '  "version": "founderos.outbox/v1",',
    '  "eventId": "' + spec.paperclip.runId + ':handoff:<what-you-need>",',
    '  "runId": "' + spec.paperclip.runId + '",',
    '  "type": "handoff",',
    '  "payload": {',
    '    "toRole": "<askKey below>",',
    '    "title": "<one deliverable, as an issue title>",',
    '    "need": "<what to produce, and where to put it>",',
    '    "inputs": ["<path they should read>"],',
    '    "acceptance": ["<how they know it is done>"]',
    "  }",
    "}",
    "```",
    "",
    "Paperclip turns that file into an issue assigned to them and wakes them. Leave `sessionId`",
    "out: Paperclip fills it, and a value you guessed would be rejected as a forged binding.",
    "",
    "Ask first: " + (spec.handoff!.askFirst.length ? spec.handoff!.askFirst.join(", ") : "whoever below owns the part") + ".",
    "",
    "| askKey | Agent | Owns |",
    "| --- | --- | --- |",
  ];
  for (const peer of peers.slice(0, 24)) {
    lines.push(`| \`${peer.askKey}\` | ${peer.name} | ${peer.title || "—"} |`);
  }
  const parked = spec.handoff!.peers.filter((peer) => peer.available === false);
  if (parked.length) {
    lines.push("");
    lines.push(`Not taking work right now: ${parked.map((peer) => `${peer.name} (${peer.note || "unavailable"})`).join(", ")}.`);
  }
  if (!peers.length) {
    // A heading with no rows reads as a truncated prompt, and the worker then asks a name it
    // invented. Say plainly that nobody is reachable, so the honest move is to report the part
    // you cannot finish rather than to guess a colleague.
    lines.splice(lines.indexOf("| askKey | Agent | Owns |"), 2);
    lines.push("No peer is reachable from this run right now. Report the part you cannot finish as a blocker; do not invent a role to ask.");
  }
  lines.push("");
  lines.push("Rules that exist because the alternative is a fleet that deadlocks politely:");
  lines.push("- One deliverable per request file. Two asks in one issue means half of it gets done and reported as the whole thing.");
  lines.push("- `eventId` must be unique per request and stable if you rewrite the file: it is what stops a duplicate ask. Reuse it only for the same ask.");
  lines.push("- Do not ask the founder, and do not ask the agent that asked you — a loop leaves both of you waiting. If the chain comes back around, report the blocker.");
  lines.push("- When you finish work someone asked you for, comment on *your* issue and mention the requester. Closing their issue for them removes the step where they check it.");
  lines.push("");
  return lines.join("\n") + "\n\n";
}

function renderToolSection(spec: JulesSessionSpec): string {
  // A capability the worker cannot physically use is worse than an absent one: it invites an
  // attempt, a failure, and a blocker report that reads as an infrastructure problem.
  const usable = spec.capabilities.filter((capability: string) => !MCP_SERVERS[capability]?.localOnly);
  // Only name a guide the bootstrap actually wrote. A pointer at a file that is not there
  // teaches the worker that references in its prompt are unreliable, which costs more than
  // the guidance is worth.
  const guidePath = spec.resourcePath ? `${spec.resourcePath}/MCP-GUIDE.md` : null;
  const pointer = guidePath
    ? `Read \`${guidePath}\` before starting: it gives the procedure and the limits for each server above.`
    : null;
  if (!usable.length) {
    return [
      // Both phrasings are load-bearing for a different reader: `agent-resources.test.ts`
      // guards that a role with no servers is told so plainly, and `assignment-prompt.test.ts`
      // guards that the fallback never names `firm` as a capability it cannot install. Say it
      // once, in a sentence that satisfies both, rather than picking a winner per commit.
      "No MCP server is declared for this outcome; work from the repository and the public web.",
      "Required capabilities: none beyond the repository itself.",
      "Name a server as a blocker only if the outcome genuinely cannot be produced without it.",
      ...(pointer ? [pointer] : []),
    ].join(" ");
  }
  const servers = usable.map((capability: string) => {
    const guide = mcpGuide(capability);
    return `- **${guide.name}** (\`${capability}\`) — ${guide.use}.`;
  });
  return [
    ...servers,
    ...(pointer ? ["", pointer] : []),
    "A server you hold is a capability, not an instruction to use it — reach for one only where it advances this outcome.",
    "",
    "Neon and Supabase are for transient, disposable query work only. Company state stays in GitHub and `firm/*.firm`: never make a Postgres database the source of truth for a business fact, and never create one to hold what a Firm file already holds.",
    "Render Static is only for static sites; services target Hugging Face Spaces.",
  ].join("\n");
}

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
4. Do NOT run \`firm\`: the CLI is not installed in your environment and never will be.
   Firm state is the \`firm/*.firm\` text files in this repository. Read them directly and
   edit them as text, following the record shapes in \`firm/schemas/\`. Paperclip runs the
   real \`firm build\` on its own side and will report anything malformed.
5. Fetch authoritative live run context from Paperclip.
6. Report repository/live-context conflicts. Never expose environment secrets.

## Role
${spec.role.description}
The role does not expand authority beyond this outcome contract.

## Objective
${spec.objective}
${spec.assignment ? `
## Assigned outcome
This session was dispatched for a specific Paperclip issue. It is the work; the objective
above is only the shape of it.

- Title: ${spec.assignment.title}
- Priority: ${spec.assignment.priority ?? "unspecified"}
- Goal: ${spec.assignment.goal ?? "none"}

${spec.assignment.description?.trim() || "No description was supplied. Work from the title, the goal, and the repository state."}
` : ""}
## Inputs
${bullets(spec.inputs)}
${spec.resourcePath ? `
## Your reference material
\`${spec.resourcePath}/MCP-GUIDE.md\` — how to use each server granted to you, and where not to.
\`${spec.resourcePath}/templates/\` — founder-supplied format and layout guidance. Read whatever
matches the artifact you are producing and follow its structure. If the folder is empty, say so
and work from the goal contract alone; do not invent a format and present it as the company's.
` : ""}

${spec.handoff ? renderHandoffSection(spec) : ""}## Required outputs
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

## Evidence discipline
A source is something another person can open: a URL, a thread permalink, or a named document. A category, a topic, or a description of a behaviour is not a source. Never mint a source ID for one — an unsourced claim labelled as sourced is worse than one left plainly unsourced.

Being directionally right matters more than being precise. Exact figures are not the deliverable and go stale; an order of magnitude and the pricing model (free tier, per-seat, per-response, usage-based, enterprise-only) are enough. Say when a number is approximate and say where its shape came from. Never write a figure you recalled as though you read it off the page — if you did not open the page this run, mark the number approximate or leave it out.

\`verified\` means you fetched the source this run and it says what you claim. If you did not open it, the status is \`hypothesis\` or \`estimate\`, never \`verified\`. This applies to the Firm records too: a record's status is a promise about what was checked.

What practitioners say in their own words is first-class evidence: named communities, subreddits, forum threads, review sites, changelog and pricing-page complaints. Prefer three real quotes with permalinks over a paragraph of confident summary. If you cannot reach a community source this run, say the social signal is missing rather than inferring what people "probably" think.

Include what cuts against the thesis. A landscape in which every fact supports the plan has not been researched, it has been assembled. Name the competitor that already does what we propose, the price point that undercuts us, the reason a segment might be unreachable — and where you looked for disconfirming evidence and did not find it, say that too.

## Tools and deployment
${renderToolSection(spec)}

${spec.persona ? spec.persona + "\n\n" : ""}## Goal-specific support
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
2. Do not run \`firm build\`: that CLI is not installed here. Re-read every \`firm/*.firm\`
   file you edited and confirm each record still matches the shapes in \`firm/schemas/\`.
3. Verify every required output and acceptance criterion.
4. Identify unresolved requirements and check Git history for secrets.
5. Submit an idempotent completion candidate to Paperclip with the PR URL and artifact paths.

A Jules COMPLETED state is only a completion candidate. Paperclip performs deterministic validation and Hermes supervisory review.

## Session economy
Continue this session for revisions whenever practical. Do not create follow-on sessions. Remaining new-session budget: **0**.

## Manager notes
${spec.managerNotes?.trim() || "None."}`;
}

/**
 * What to say to a session that is already running.
 *
 * Continuing a session costs nothing against the daily session-start quota and keeps
 * everything the worker has already read and reasoned about, so a wake on live work is
 * a message, not a new session. Re-sending the whole assignment contract would be both
 * wasteful and confusing — the worker already has it — so this carries only what has
 * changed since it started: why it was woken, and the current statement of the outcome.
 */
export function renderJulesContinuation(spec: JulesSessionSpec, input: { reason?: string } = {}): string {
  const assignment = spec.assignment;
  return `# Continuation — Paperclip run \`${spec.paperclip.runId}\`

You are already working this outcome. Do not start over and do not open a second session:
continue from where you are, and fold anything below into what you have.

${input.reason?.trim() ? `Why you were woken: ${input.reason.trim()}` : "Woken to continue the assigned outcome."}
${assignment ? `
## The outcome, as it currently stands
- Title: ${assignment.title}
- Priority: ${assignment.priority ?? "unspecified"}
- Goal: ${assignment.goal ?? "none"}

${assignment.description?.trim() || "No description was supplied."}

If this differs from what you were originally given, this statement wins.
` : ""}
If you have learned something that changes the shape of the work — a source that
contradicts an earlier finding, a gap that turns out to be served, a claim you cannot
substantiate — say so rather than continuing past it. Revising an earlier conclusion is
a result, not a failure.

The completion protocol you were given at the start still applies unchanged.`;
}

export function createJulesSessionSpec(input: Omit<JulesSessionSpec, "version">): JulesSessionSpec {
  return { version: JULES_PROMPT_VERSION, ...input };
}
