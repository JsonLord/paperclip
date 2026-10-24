import { DEFAULT_RESOURCE_ROOT, MCP_SERVERS } from "@paperclipai/adapter-jules";
import type { WorkforceMember } from "./founderos-deployment-catalog.js";

/**
 * Where per-role reference material lives inside the company repository.
 *
 * Re-exported from the adapter rather than restated here, because the path appears in both
 * the bootstrap write and the dispatch prompt. A prompt pointing at a folder bootstrap never
 * wrote is worse than no pointer at all: the worker reports the gap as a blocker, or worse,
 * invents what it assumed was there.
 */
export const WORKER_RESOURCE_ROOT = DEFAULT_RESOURCE_ROOT;

/**
 * The MCP guide an agent reads from its own resource folder.
 *
 * Generated rather than hand-maintained because the same facts already live in two other
 * places: `MCP_SERVERS` decides what the dispatch prompt says, and the workforce catalog
 * decides which servers a role holds. A hand-written doc drifts from both the moment either
 * changes, and an agent following a stale guide reaches for a server it was never granted.
 * Deriving it from those sources makes the guide and the prompt unable to disagree.
 */
export function renderAgentMcpGuide(worker: WorkforceMember): string {
  const lines: string[] = [];
  lines.push(`# ${worker.name} \u2014 MCP tool guide`);
  lines.push("");
  lines.push(`Role: ${worker.title}`);
  lines.push("");
  lines.push("Generated at bootstrap from the workforce catalog and the MCP registry. Edit the catalog, not this file.");
  lines.push("");

  if (!worker.mcp.length) {
    lines.push("No MCP server is granted to this role. Work from the repository, the public web, and the evidence other agents have filed.");
    lines.push("");
    lines.push("If an outcome genuinely cannot be produced without a server, report it as a blocker rather than working around it.");
    return lines.join("\n") + "\n";
  }

  lines.push("## Servers granted to this role");
  lines.push("");
  lines.push("A grant is a capability, not an instruction. Use a server only where it advances the outcome you were dispatched for.");
  lines.push("");
  for (const capability of worker.mcp) {
    const guide = MCP_SERVERS[capability];
    lines.push(`### ${guide ? guide.name : capability} (\`${capability}\`)`);
    lines.push("");
    if (!guide) {
      lines.push("Declared for this role but absent from the MCP registry. Confirm what it exposes before relying on it.");
      lines.push("");
      continue;
    }
    lines.push(`**Use it for:** ${guide.use}.`);
    lines.push("");
    lines.push("**Procedure**");
    lines.push("");
    guide.howTo.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    lines.push("");
    lines.push("**Limits**");
    lines.push("");
    for (const caution of guide.cautions) lines.push(`- ${caution}`);
    lines.push("");
    const shared = guide.goals.filter((goal) => worker.goals.includes(goal));
    if (shared.length) {
      lines.push(`**Goals you own where this matters:** ${shared.map((goal) => `\`${goal}\``).join(", ")}`);
      lines.push("");
    }
  }

  lines.push("## Goals this role owns");
  lines.push("");
  for (const goal of worker.goals) lines.push(`- \`${goal}\``);
  lines.push("");
  lines.push("## Standing rules");
  lines.push("");
  lines.push("- Company state lives in GitHub and `firm/*.firm`. No MCP server is a source of truth for a business fact.");
  lines.push("- Anything a claim rests on is filed under `evidence/` with a source another person can open.");
  lines.push("- External effects \u2014 publishing, spend, outreach, deployments \u2014 stop for approval first.");
  lines.push("- Founder-supplied reference documents live in this folder's `templates/` slot; read them before producing an artifact.");
  return lines.join("\n") + "\n";
}

/**
 * The index an agent reads first, naming every role's folder so a worker handing work to
 * another role knows where that role's material lives.
 */
export function renderResourceRootIndex(workforce: readonly WorkforceMember[]): string {
  const lines: string[] = [];
  lines.push("# Agent resource folders");
  lines.push("");
  lines.push("Per-role reference material. Each folder holds an `MCP-GUIDE.md` generated at bootstrap and a `templates/` slot for founder-supplied documents.");
  lines.push("");
  lines.push("| Role | Folder | MCP servers |");
  lines.push("| --- | --- | --- |");
  for (const worker of workforce) {
    lines.push(`| ${worker.name} | \`${WORKER_RESOURCE_ROOT}/${worker.key}/\` | ${worker.mcp.length ? worker.mcp.map((m) => `\`${m}\``).join(", ") : "\u2014"} |`);
  }
  lines.push("");
  lines.push("## Where the company documents go");
  lines.push("");
  lines.push("- **Business Model Canvas, business plan, pitch structure** \u2192 `business/templates/`. The Business Case Architect reads it before compiling any artifact.");
  lines.push("- **Long-form research format and depth bar** \u2192 `researcher/templates/`.");
  lines.push("- **Fake-door and experiment design conventions** \u2192 `experiment/templates/`.");
  lines.push("- **Metric definitions and decision thresholds** \u2192 `product/templates/` and `finance/templates/`.");
  lines.push("");
  lines.push("Anything placed here is read by the role that owns the folder. Keep it to method, format, and layout guidance: example claims, traction figures, or business data written into a template get copied onward as though they were fact.");
  return lines.join("\n") + "\n";
}

/**
 * Per-agent resource folders, written into the company repository at bootstrap.
 *
 * Each role gets its MCP guide plus a `templates/` slot for the reference documents the
 * founder supplies \u2014 the business-plan format, the pitch structure, the canvas layout.
 * Those are what an agent orients itself against, so the folder is both the instruction and
 * the input path, and the dispatch prompt names it.
 */
export function createResourceFoldersForWorkforce(workforce: readonly WorkforceMember[]): Record<string, string> {
  const files: Record<string, string> = {};
  for (const worker of workforce) {
    const base = `${WORKER_RESOURCE_ROOT}/${worker.key}`;
    files[`${base}/MCP-GUIDE.md`] = renderAgentMcpGuide(worker);
    files[`${base}/templates/.gitkeep`] = `# ${worker.name}: place the reference documents this role orients itself against in this folder.\n`;
  }
  files[`${WORKER_RESOURCE_ROOT}/README.md`] = renderResourceRootIndex(workforce);
  return files;
}
