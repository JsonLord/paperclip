import { describe, expect, it } from "vitest";
import { createJulesSessionSpec, JULES_OUTCOME_TEMPLATES, MCP_SERVERS, renderJulesPrompt } from "@paperclipai/adapter-jules";
import { founderOsWorkforce } from "../services/founderos-deployment-catalog.js";
import { createResourceFoldersForWorkforce, renderAgentMcpGuide, WORKER_RESOURCE_ROOT } from "../services/agent-resources.js";

describe("per-agent resource folders", () => {
  const files = createResourceFoldersForWorkforce(founderOsWorkforce);

  it("gives every workforce role a guide and a template slot", () => {
    for (const worker of founderOsWorkforce) {
      expect(files[`${WORKER_RESOURCE_ROOT}/${worker.key}/MCP-GUIDE.md`], worker.key).toBeTruthy();
      expect(files[`${WORKER_RESOURCE_ROOT}/${worker.key}/templates/.gitkeep`], worker.key).toBeTruthy();
    }
    expect(files[`${WORKER_RESOURCE_ROOT}/README.md`]).toContain("## Where the company documents go");
  });

  it("grants only servers the deployment registry can describe", () => {
    // A capability the registry does not know renders as an unexplained heading, and the
    // agent either ignores the grant or invents what the server does.
    const unknown = founderOsWorkforce.flatMap((w) => w.mcp.filter((m) => !MCP_SERVERS[m]).map((m) => `${w.key}:${m}`));
    expect(unknown).toEqual([]);
  });

  it("names only goal templates that actually exist", () => {
    const known = new Set(Object.values(MCP_SERVERS).flatMap((g) => g.goals));
    // Registry goals must be a subset of what roles claim, or a server is advertised against
    // a goal nobody owns and the mapping is decoration.
    const owned = new Set(founderOsWorkforce.flatMap((w) => w.goals));
    for (const goal of known) expect(owned.has(goal), goal).toBe(true);
  });

  it("writes procedure and limits for each granted server", () => {
    const guide = files[`${WORKER_RESOURCE_ROOT}/experiment/MCP-GUIDE.md`];
    expect(guide).toContain("### Stitch (`stitch`)");
    expect(guide).toContain("**Procedure**");
    expect(guide).toContain("**Limits**");
  });

  it("degrades an unknown capability instead of crashing the bootstrap", () => {
    // One typo in the catalog must not stop every company from bootstrapping.
    const rendered = renderAgentMcpGuide({ key: "x", name: "X", title: "X", roleAliases: [], mcp: ["not-a-server"], goals: [] });
    expect(rendered).toContain("### not-a-server (`not-a-server`)");
    expect(rendered).toContain("absent from the MCP registry");
  });

  it("tells a role with no servers to work without them", () => {
    const rendered = renderAgentMcpGuide({ key: "x", name: "X", title: "X", roleAliases: [], mcp: [], goals: [] });
    expect(rendered).toContain("No MCP server is granted to this role");
  });
});

describe("Stitch and v0 are distinct servers", () => {
  it("keeps Stitch as the design tool and v0 as the implementation tool", () => {
    // They were conflated once, which sent agents to v0 for design work and produced code
    // for a layout nobody had settled.
    expect(MCP_SERVERS.stitch.name).toBe("Stitch");
    expect(MCP_SERVERS.v0.name).toContain("v0");
    expect(MCP_SERVERS.stitch.use).toContain("design");
    expect(MCP_SERVERS.v0.use).toContain("implementation");
  });
});

describe("dispatch prompt tool section", () => {
  const base = {
    company: { id: "c", name: "n", repository: "o/r" },
    paperclip: { runId: "r", agentId: "a" },
    linear: { mode: "NONE" as const },
    inputs: [],
    externalActions: "APPROVAL_REQUIRED" as const,
  };

  it("points the worker at the guide bootstrap wrote for it", () => {
    const template = JULES_OUTCOME_TEMPLATES.fake_door;
    const prompt = renderJulesPrompt(createJulesSessionSpec({
      ...base, role: template.role, objective: template.objective,
      execution: { source: "s", startingBranch: "main", requirePlanApproval: false },
      capabilities: [...template.capabilities], writeScope: [...template.writeScope],
      requiredOutputs: [...template.requiredOutputs], acceptanceCriteria: [...template.acceptanceCriteria],
      cannotCompleteIf: [...template.cannotCompleteIf], resourcePath: `${WORKER_RESOURCE_ROOT}/experiment`,
    }));
    expect(prompt).toContain("**Stitch** (`stitch`)");
    expect(prompt).toContain("**v0 by Vercel** (`v0`)");
    expect(prompt).toContain(`${WORKER_RESOURCE_ROOT}/experiment/MCP-GUIDE.md`);
    expect(prompt).toContain("## Your reference material");
  });

  it("names no guide file when the agent was given no resource path", () => {
    // A pointer at a file that does not exist teaches the worker that prompt references are
    // unreliable, which costs more than the guidance is worth.
    const template = JULES_OUTCOME_TEMPLATES.market_research;
    const prompt = renderJulesPrompt(createJulesSessionSpec({
      ...base, role: template.role, objective: template.objective,
      execution: { source: "s", startingBranch: "main", requirePlanApproval: false },
      capabilities: [], writeScope: [...template.writeScope],
      requiredOutputs: [...template.requiredOutputs], acceptanceCriteria: [...template.acceptanceCriteria],
      cannotCompleteIf: [...template.cannotCompleteIf],
    }));
    expect(prompt).not.toContain("MCP-GUIDE.md");
    expect(prompt).not.toContain("## Your reference material");
    expect(prompt).toContain("No MCP server is declared");
  });
});
