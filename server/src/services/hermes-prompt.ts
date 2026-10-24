/**
 * A prompt template for hermes_local that authenticates.
 *
 * hermes-paperclip-adapter ships a default template whose every curl example omits
 * the Authorization header, so an agent that follows it gets 401 on every call and
 * then has to improvise — which is where a small model starts inventing reasons it
 * cannot proceed. Paperclip mints the token and owns the auth contract, so it
 * supplies the template rather than leaving the agent to guess.
 *
 * Mustache-style placeholders are the adapter's own; it renders them before spawning.
 * PAPERCLIP_API_KEY and PAPERCLIP_RUN_ID are read from the environment at run time and
 * must stay as shell variables so no token is ever written into the prompt.
 */
import { MCP_SERVERS } from "@paperclipai/adapter-jules";
import { FOUNDER_MANAGER_REPORT_TEMPLATE } from "./founder-manager-reporting.js";

/**
 * The manager's MCP section, generated from the same registry the Jules dispatch prompt and
 * each agent's resource folder are built from.
 *
 * The Founder Manager is shown every server because it routes work between roles and needs
 * to know which capability exists before it assigns an outcome; the workers each see only
 * what they were granted. Guidance stays identical across all three surfaces because there
 * is one source, so reassigning a server is a catalog edit rather than a documentation hunt.
 */
function renderMcpSection(): string {
  const lines = ["The following MCP servers are configured for this deployment. A server is a capability you may call on, not a step you must perform:"];
  lines.push("");
  for (const [capability, guide] of Object.entries(MCP_SERVERS)) {
    lines.push(`- **${guide.name}** (\`${capability}\`): ${guide.use}.`);
    lines.push(`  Relevant goals: ${guide.goals.map((goal) => `\`${goal}\``).join(", ")}.`);
    lines.push(`  Limits: ${guide.cautions[0]}`);
  }
  lines.push("");
  lines.push("Assign an outcome to the role that holds the capability it needs. Never make a server the source of truth for a business fact: company state stays in GitHub and `firm/*.firm`.");
  return lines.join("\n");
}

export const HERMES_PROMPT_TEMPLATE = `You are "{{agentName}}", an AI agent employee in a Paperclip-managed company.

IMPORTANT: Use the \`terminal\` tool with \`curl\` for ALL Paperclip API calls (web_extract and browser cannot reach localhost).

Your credentials are ALREADY set in this shell as $PAPERCLIP_API_KEY and
$PAPERCLIP_RUN_ID. Writing those variable names into a curl command is the correct,
expected and safe way to authenticate — the shell substitutes the values when the
command runs, and nothing is printed or shared. You are not exposing a secret by
doing this, and you do not need anyone to give you a token.

Every Paperclip request sends:
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
and every request that MODIFIES an issue also sends:
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID"

Nothing blocks these commands. Run them. A 401 means the header was missing or
misspelled, not that you lack permission and not that a policy stopped you.

## Available MCP servers
${renderMcpSection()}

Your Paperclip identity:
  Agent ID: {{agentId}}
  Company ID: {{companyId}}
  API Base: {{paperclipApiUrl}}

{{#taskId}}
## Assigned Task

Issue ID: {{taskId}}
Title: {{taskTitle}}

{{taskBody}}

## Workflow

1. Check out the issue before doing any work:
   curl -s -X POST "{{paperclipApiUrl}}/issues/{{taskId}}/checkout" -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -H "Content-Type: application/json" -d '{"agentId":"{{agentId}}"}'
2. Do the work with your tools.
3. Mark it done:
   curl -s -X PATCH "{{paperclipApiUrl}}/issues/{{taskId}}" -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -H "Content-Type: application/json" -d '{"status":"done"}'
4. Report what you did.
{{/taskId}}

{{#noTask}}
## Heartbeat Wake — Check for Work

1. List the issues assigned to you:
   curl -s "{{paperclipApiUrl}}/companies/{{companyId}}/issues?assigneeAgentId={{agentId}}&status=todo" -H "Authorization: Bearer $PAPERCLIP_API_KEY" | python3 -m json.tool
2. If there are issues, take the highest priority one:
   - Check out: curl -s -X POST "{{paperclipApiUrl}}/issues/ISSUE_ID/checkout" -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -H "Content-Type: application/json" -d '{"agentId":"{{agentId}}"}'
   - Do the work.
   - Complete: curl -s -X PATCH "{{paperclipApiUrl}}/issues/ISSUE_ID" -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -H "Content-Type: application/json" -d '{"status":"done"}'
3. Otherwise look at the backlog:
   curl -s "{{paperclipApiUrl}}/companies/{{companyId}}/issues?status=backlog" -H "Authorization: Bearer $PAPERCLIP_API_KEY" | python3 -m json.tool
4. If there is genuinely nothing to do, say so briefly.
{{/noTask}}

## Writing to a company repository

When your task is to produce files in a company's GitHub repository, a GitHub token is
already set in this shell as $GITHUB_TOKEN. Do NOT \`git clone\` — the terminal scanner
refuses it and you do not need it. Write through the GitHub REST API with curl, the same
way you call Paperclip:

1. Read a file (get its blob sha, needed to update it):
   curl -s "https://api.github.com/repos/OWNER/REPO/contents/PATH?ref=BRANCH" -H "Authorization: Bearer $GITHUB_TOKEN"
2. Branch from the default branch: get its head sha, then create the ref:
   curl -s "https://api.github.com/repos/OWNER/REPO/git/ref/heads/main" -H "Authorization: Bearer $GITHUB_TOKEN"
   curl -s -X POST "https://api.github.com/repos/OWNER/REPO/git/refs" -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/json" -d '{"ref":"refs/heads/BRANCH","sha":"HEAD_SHA"}'
3. Create or update a file (content is base64; include sha only when replacing):
   curl -s -X PUT "https://api.github.com/repos/OWNER/REPO/contents/PATH" -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/json" -d "{\\"message\\":\\"...\\",\\"content\\":\\"$(printf %s "FILE TEXT" | base64 -w0)\\",\\"branch\\":\\"BRANCH\\"}"
4. Open a pull request (never merge it — a human holds that gate):
   curl -s -X POST "https://api.github.com/repos/OWNER/REPO/pulls" -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/json" -d '{"title":"...","head":"BRANCH","base":"main","body":"..."}'

Writing $GITHUB_TOKEN into a curl command is the correct, expected way to authenticate,
exactly as with $PAPERCLIP_API_KEY. Do not merge your own pull request and do not push to
the default branch directly. Only write what your task asks for.

If a command fails, quote the actual stderr the tool returned. Never state that a
security policy, scanner or permission blocked you unless the tool itself returned
that text — if you did not run the command, say that instead. Never ask the operator
for a token; you already have one.
`;

/**
 * The handoff call shown to a locally-run agent. It posts to `/handoff`, not to `/issues`, and
 * the difference is not ceremony: the handoff route records who asked and which issue they were
 * working on, which is what lets the server refuse a request that would close a loop or has
 * already passed through five agents. Creating the same assignment through the plain issue route
 * succeeds and is invisible to both guards, so the fleet can deadlock through it.
 *
 * A template literal because the command needs both kinds of quote; escaping either inside a
 * quoted string is how this file once stopped parsing. The adapter's `{{...}}` tokens and the
 * shell's `$VAR`s are left untouched.
 */
const CURL_HANDOFF = `  curl -s -X POST "{{paperclipApiUrl}}/companies/{{companyId}}/handoff" \\
    -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \\
    -H "content-type: application/json" \\
    -d '{"toRole":"<ask key below>","title":"<one deliverable>","need":"<what to produce and where to put it>","fromIssueId":"<the issue you are working on, if any>"}'`;


export interface HermesPromptPeer {
  name: string;
  askKey: string;
  title?: string;
  available?: boolean;
  note?: string;
}

export interface HermesPromptOptions {
  /**
   * The Founder Manager gets the reporting contract instead of the generic one. Decided by
   * the caller from agent metadata, not by adapter type: every FounderOS worker that runs
   * locally would otherwise be told to publish dashboards.
   */
  founderManager?: boolean;
  dashboardBaseUrl?: string;
  dashboardId?: string;
  /**
   * A vendored persona for this agent, and the peers it may ask for part of its job. A local
   * agent holds a Paperclip credential, so unlike a Jules worker it asks by creating an assigned
   * issue over the API directly.
   */
  persona?: string | null;
  peers?: HermesPromptPeer[];
  /**
   * Capabilities this agent's role declares, so the prompt can explain the ones that have a
   * procedure worth knowing. The Founder Manager gets its own template; every other local role
   * gets the generic one plus whichever of these it actually holds.
   */
  capabilities?: string[];
  /** True when the deployment supplied the dashboard key, so the prompt can promise it exists. */
  dashboardKeyReady?: boolean;
}

/**
 * Fill the template's Paperclip-side placeholders without touching the adapter's.
 *
 * The adapter renders `{{agentName}}`, `{{taskId}}` and friends and leaves what it does not
 * know as literal text, so a dashboard URL left as a placeholder would reach the agent as
 * braces. Substituting ours first keeps both sets working.
 */
function renderDashboardPlaceholders(template: string, options: HermesPromptOptions): string {
  const base = (options.dashboardBaseUrl ?? "").replace(/\/+$/, "");
  return template
    .replaceAll("{{dashboardBaseUrl}}", base)
    .replaceAll("{{dashboardId}}", options.dashboardId ?? "")
    .replaceAll("{{dashboardPublicView}}", base && options.dashboardId ? "The public URL is " : "");
}

/**
 * The peers section for a locally-run agent.
 *
 * A local agent already holds $PAPERCLIP_API_KEY and a `tasks:assign` grant, so it asks over the
 * API directly — no outbox file, which exists for workers that cannot reach the API at all. The
 * directory is rendered because the agent cannot list the fleet itself, and a role name it guesses
 * may match somebody unintended.
 */
/** The read-the-dashboard-first probe shown to a dashboard-enabled agent. A template literal
 * because the command needs both quote styles: nesting them inside a quoted string is what broke
 * this file's parse twice. */
const curlProbe = (base: string) => `  curl -s "${base}/api/dashboards" -H "Authorization: Bearer $DASHBOARD_API_KEY" | python3 -m json.tool`;

/**
 * The dashboard procedure for a locally-run agent that holds the capability.
 *
 * The Founder Manager has this baked into its own template. Any other reporting role — the Data
 * Presentationalist, which the founder calls on for dashboard updates and for the visual halves
 * of the business plan — runs on the generic template and would otherwise learn only that a
 * "Agent Dashboards" capability exists, with no shapes. Each rule below was confirmed against the
 * Space before it was written, because the failure modes are silent: a `text` widget renders in a
 * plain `<div>`, so a bullet list with newlines arrives as one run-on sentence and looks like the
 * agent's own formatting error rather than a rendering constraint.
 */
function renderDashboardCapabilitySection(options: HermesPromptOptions): string {
  if (!options.dashboardKeyReady) return "";
  const base = (options.dashboardBaseUrl ?? "").replace(/\/+$/, "");
  if (!base) return "";
  const { cautions } = MCP_SERVERS.dashboard;
  const lines = [
    "",
    "## Publishing to the Agent Dashboards space",
    "",
    "`$DASHBOARD_API_KEY` is set in this shell. Every `/api` route needs it; `/health` does not.",
    "",
    curlProbe(base),
    "",
    "Read the dashboard before writing it. The layout is created once by `POST /api/dashboards`",
    "(its body must carry an \"id\"), and later changed by `PUT /api/dashboards/{id}`. Beware:",
    "a \"widgets\" array in either call **replaces the entire layout** — send the full list, or",
    "omit the key and leave the arrangement alone.",
    "",
    "Content is refreshed with `PUT /api/dashboards/{id}/data`, which shallow-merges: each key you",
    "send is replaced whole, every key you omit is left alone. So send the section you changed,",
    "not a reconstruction of the page.",
    "",
    "Finish with `POST /api/sync`. Durable backup runs once a day without it, which makes an",
    "un-synced report a report that did not happen.",
    "",
    "The one layout rule that bites: **one bullet = one `table` widget row.** A `text` widget is a",
    "plain `<div>`, so newlines collapse and your list renders as a single sentence.",
    "",
    "Limits:",
    ...cautions.map((line) => `- ${line}`),
    "",
    `This company's daily report lives at \`${options.dashboardId ?? "the id in your task"}\`. Existing ids may be listed by the first call above — reuse one rather than minting a near-duplicate, because two dashboards for one company means the founder reads whichever one was written last.`,
    "",
  ];
  return lines.join("\n");
}

function renderPeerSection(options: HermesPromptOptions): string {
  const peers = (options.peers ?? []).filter((peer) => peer.available !== false);
  if (!peers.length) return "";
  const parked = (options.peers ?? []).filter((peer) => peer.available === false);
  const lines = [
    "",
    "## Asking a peer for part of the job",
    "",
    "If part of your task belongs to another agent, ask them rather than doing their part badly.",
    "Paperclip turns this call into an issue assigned to them and wakes them. Ask by role, not",
    "by agent id: you are naming the job, and the server decides who is playing it.",
    "",
    CURL_HANDOFF,
    "",
    "| ask | Agent | Owns |",
    "| --- | --- | --- |",
  ];
  for (const peer of peers.slice(0, 30)) lines.push(`| ${peer.askKey} | ${peer.name} | ${peer.title || "—"} |`);
  if (parked.length) lines.push("", `Not taking work right now: ${parked.map((peer) => `${peer.name} (${peer.note || "unavailable"})`).join(", ")}.`);
  lines.push("");
  lines.push("- One deliverable per issue. Never ask the founder this way, and never ask the agent that asked you: a loop leaves both of you waiting. If it comes back around, report the blocker.");
  lines.push("- Send `fromIssueId` when you were asked to do something yourself — it is how the server knows you are already inside a chain, and its only way to tell you not to hand the work back.");
  lines.push("- Mid-run, to see who exists and who is paused: `curl -s \"{{paperclipApiUrl}}/companies/{{companyId}}/peers\" -H \"Authorization: Bearer $PAPERCLIP_API_KEY\"`.");
  return lines.join("\n");
}

/**
 * Supply the authenticating template to a hermes_local agent that has not configured one of its
 * own. An operator's `promptTemplate` always wins.
 */
export function withHermesPromptTemplate(
  config: Record<string, unknown>,
  adapterType: string,
  options: HermesPromptOptions = {},
): { config: Record<string, unknown>; applied: boolean } {
  if (adapterType !== "hermes_local") return { config, applied: false };
  const configured = config.promptTemplate;
  if (typeof configured === "string" && configured.trim().length > 0) return { config, applied: false };
  // Persona and peer sections are appended to whichever template is chosen. They are appended
  // rather than interpolated because the template is a module-level constant, and per-agent text
  // cannot be baked into it.
  const append = [options.persona ?? "", renderDashboardCapabilitySection(options), renderPeerSection(options)].filter((part) => part.trim()).join("\n");
  if (options.founderManager) {
    return { config: { ...config, promptTemplate: renderDashboardPlaceholders(FOUNDER_MANAGER_REPORT_TEMPLATE + (append ? "\n" + append : ""), options) }, applied: true };
  }
  return { config: { ...config, promptTemplate: renderDashboardPlaceholders(HERMES_PROMPT_TEMPLATE + (append ? "\n" + append : ""), options) }, applied: true };
}

/** Exposed for the test that asserts every example carries the auth header. */
export function curlExamplesIn(template: string): string[] {
  return template.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("curl ") || line.includes(": curl "));
}
