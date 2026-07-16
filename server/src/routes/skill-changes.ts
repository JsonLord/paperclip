import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { skillResolverService } from "../services/agent-runtime/skill-resolver.js";
import { assertCompanyAccess } from "./authz.js";

export function skillChangeRoutes(db: Db) {
  const router = Router();
  const svc = skillResolverService(db);

  async function getAgentCompanyId(agentId: string): Promise<string | null> {
    const [agent] = await db
      .select({ companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return agent?.companyId ?? null;
  }

  // List changes for a skill
  router.get("/companies/:companyId/skills/:skillId/changes", async (req, res) => {
    const { companyId, skillId } = req.params;
    assertCompanyAccess(req, companyId);

    const changes = await svc.listChangesForSkill(skillId);
    res.json(changes);
  });

  // List all skill changes by an agent
  router.get("/agents/:agentId/skill-changes", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const changes = await svc.listChangesByAgent(agentId);
    res.json(changes);
  });

  return router;
}
