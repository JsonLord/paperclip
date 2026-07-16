import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { mcpResolverService } from "../services/agent-runtime/mcp-resolver.js";
import { assertCompanyAccess } from "./authz.js";

export function mcpServerRoutes(db: Db) {
  const router = Router();
  const svc = mcpResolverService(db);

  async function getAgentCompanyId(agentId: string): Promise<string | null> {
    const [agent] = await db
      .select({ companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return agent?.companyId ?? null;
  }

  // List all MCP servers for a company
  router.get("/companies/:companyId/mcp-servers", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const servers = await svc.listServers(companyId);
    res.json(servers);
  });

  // Create an MCP server (manual)
  router.post("/companies/:companyId/mcp-servers", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const { name, description, command, args, env, transportType, transportUrl, scope, agentId } = req.body;

    // HTTP/SSE MCPs don't need a command — they use a URL instead
    const needsCommand = transportType === "stdio";
    if (!name || !transportType || (needsCommand && !command)) {
      res.status(400).json({ error: "Missing required fields: name, transportType (and command for stdio)" });
      return;
    }

    const server = await svc.createServer({
      companyId,
      name,
      description,
      command,
      args,
      env,
      transportType,
      transportUrl,
      scope,
      agentId,
    });

    res.status(201).json(server);
  });

  // Sync from Claude Code settings
  router.post("/companies/:companyId/mcp-servers/sync", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const result = await svc.syncFromClaudeCode(companyId);
    const servers = await svc.listServers(companyId);
    res.json({ imported: result.discovered.length, servers });
  });

  // Update an MCP server
  router.patch("/companies/:companyId/mcp-servers/:serverId", async (req, res) => {
    const { companyId, serverId } = req.params;
    assertCompanyAccess(req, companyId);

    const { name, description, command, args, env, transportType, transportUrl, enabled } = req.body;

    const updated = await svc.updateServer(serverId, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(command !== undefined && { command }),
      ...(args !== undefined && { args }),
      ...(env !== undefined && { env }),
      ...(transportType !== undefined && { transportType }),
      ...(transportUrl !== undefined && { transportUrl }),
      ...(enabled !== undefined && { enabled }),
    });

    if (!updated) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }

    res.json(updated);
  });

  // Delete an MCP server
  router.delete("/companies/:companyId/mcp-servers/:serverId", async (req, res) => {
    const { companyId, serverId } = req.params;
    assertCompanyAccess(req, companyId);

    const deleted = await svc.deleteServer(serverId);
    if (!deleted) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }

    res.json({ success: true });
  });

  // Exclude an MCP server from an agent
  router.post("/agents/:agentId/mcp-exclusions", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const { mcpServerId } = req.body;
    if (!mcpServerId) {
      res.status(400).json({ error: "Missing required field: mcpServerId" });
      return;
    }

    const result = await svc.addExclusion(agentId, mcpServerId);
    res.status(201).json(result);
  });

  // Remove an MCP exclusion
  router.delete("/agents/:agentId/mcp-exclusions/:serverId", async (req, res) => {
    const { agentId, serverId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const result = await svc.removeExclusion(agentId, serverId);
    res.json(result);
  });

  return router;
}
