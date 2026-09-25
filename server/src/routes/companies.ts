import { Router } from "express";
import { JulesApiClient } from "@paperclipai/adapter-jules/server";
import { issues, type Db } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createCompanySchema,
  updateCompanySchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  budgetService,
  companyPortabilityService,
  companyService,
  founderOsBootstrapService,
  founderOsRebindService,
  julesEnvProfileService,
  persistedJulesSourceResolver,
  heartbeatService,
  logActivity,
} from "../services/index.js";
import { githubFounderOsRepositoryWriter, inspectCompanyRepository } from "../services/founderos-github.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function companyRoutes(db: Db) {
  const router = Router();
  const svc = companyService(db);
  const portability = companyPortabilityService(db);
  const access = accessService(db);
  const budgets = budgetService(db);

  router.get("/", async (req, res) => {
    assertBoard(req);
    const result = await svc.list();
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
      res.json(result);
      return;
    }
    const allowed = new Set(req.actor.companyIds ?? []);
    res.json(result.filter((company) => allowed.has(company.id)));
  });

  router.get("/stats", async (req, res) => {
    assertBoard(req);
    const allowed = req.actor.source === "local_implicit" || req.actor.isInstanceAdmin
      ? null
      : new Set(req.actor.companyIds ?? []);
    const stats = await svc.stats();
    if (!allowed) {
      res.json(stats);
      return;
    }
    const filtered = Object.fromEntries(Object.entries(stats).filter(([companyId]) => allowed.has(companyId)));
    res.json(filtered);
  });

  // Common malformed path when companyId is empty in "/api/companies/{companyId}/issues".
  router.get("/issues", (_req, res) => {
    res.status(400).json({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  router.get("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  });

  router.post("/:companyId/export", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/import/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const preview = await portability.previewImport(req.body);
    res.json(preview);
  });

  router.post("/import", validate(companyPortabilityImportSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const actor = getActorInfo(req);
    const result = await portability.importBundle(req.body, req.actor.type === "board" ? req.actor.userId : null);
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.imported",
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    });
    res.json(result);
  });

  router.post("/import/github", async (req, res) => {
    assertBoard(req);
    if (!(req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) throw forbidden("Instance admin required");
    const repository = typeof req.body?.repository === "string" ? req.body.repository.trim() : "";
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : repository.split("/").pop();
    const contentCommit = typeof req.body?.contentCommit === "string" ? req.body.contentCommit.trim() : "";
    if (!repository || !name || !contentCommit) return void res.status(422).json({ error: "repository, name, and pinned contentCommit are required" });
    const repo = await inspectCompanyRepository(repository, typeof req.body?.ref === "string" ? req.body.ref : undefined);
    const company = await svc.create({ name, description: typeof req.body?.description === "string" ? req.body.description : `FounderOS company imported from ${repository}`, firmGithubRepo: repository });
    await access.ensureMembership(company.id, "user", req.actor.userId ?? "local-board", "owner", "active");
    // Import the JULES_API_* environment keys as this company's secrets before the
    // resolver runs. Seeding later cannot help: bootstrap would already have found
    // no usable profile and created every Jules worker paused.
    await julesEnvProfileService(db).ensureForCompany(company.id, { userId: req.actor.userId ?? "system" });
    const resolver = persistedJulesSourceResolver(db, company.id, (apiKey) => new JulesApiClient("https://jules.googleapis.com/v1alpha", apiKey));
    const heartbeat = heartbeatService(db);
    const bootstrap = founderOsBootstrapService(db, { contentCommit, sourceResolver: resolver, repositoryWriter: process.env.GITHUB_TOKEN ? githubFounderOsRepositoryWriter() : undefined, queueInitialOutcome: async (issueId) => {
      const issue = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1).then((rows) => rows[0]);
      if (issue?.assigneeAgentId) await heartbeat.invoke(issue.assigneeAgentId, "assignment", { issueId, goalId: issue.goalId, projectId: issue.projectId, source: "founderos_bootstrap" }, "system", { actorType: "system", actorId: "founderos-bootstrap" });
    }});
    const result = await bootstrap.bootstrap(company.id, repo);
    res.status(201).json({ company, ...result });
  });

  // Jules profiles can only be created against a company, but bootstrap resolves the Jules
  // Source once and is idempotent afterwards. A company imported before its profiles existed
  // therefore keeps every worker paused; this repairs it in place rather than re-importing,
  // which would only create a duplicate company.
  router.post("/:companyId/founderos/rebind-jules-source", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (!(req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) throw forbidden("Instance admin required");
    await julesEnvProfileService(db).ensureForCompany(companyId, { userId: req.actor.userId ?? "system" });
    const resolver = persistedJulesSourceResolver(db, companyId, (apiKey) => new JulesApiClient("https://jules.googleapis.com/v1alpha", apiKey));
    const result = await founderOsRebindService(db, { sourceResolver: resolver }).rebindJulesSource(companyId);
    if (result.rebound) {
      const heartbeat = heartbeatService(db);
      for (const issueId of (result as { unblockedIssueIds?: string[] }).unblockedIssueIds ?? []) {
        const issue = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1).then((rows) => rows[0]);
        if (issue?.assigneeAgentId) await heartbeat.invoke(issue.assigneeAgentId, "assignment", { issueId, goalId: issue.goalId, projectId: issue.projectId, source: "founderos_rebind" }, "system", { actorType: "system", actorId: "founderos-rebind" });
      }
    }
    res.status(result.rebound ? 200 : 409).json(result);
  });

  router.post("/", validate(createCompanySchema), async (req, res) => {
    assertBoard(req);
    if (!(req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) {
      throw forbidden("Instance admin required");
    }
    const company = await svc.create(req.body);
    await access.ensureMembership(company.id, "user", req.actor.userId ?? "local-board", "owner", "active");
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name },
    });
    if (company.budgetMonthlyCents > 0) {
      await budgets.upsertPolicy(
        company.id,
        {
          scopeType: "company",
          scopeId: company.id,
          amount: company.budgetMonthlyCents,
          windowKind: "calendar_month_utc",
        },
        req.actor.userId ?? "board",
      );
    }
    res.status(201).json(company);
  });

  router.patch("/:companyId", validate(updateCompanySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.update(companyId, req.body);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      details: req.body,
    });
    res.json(company);
  });

  router.post("/:companyId/archive", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.archive(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.archived",
      entityType: "company",
      entityId: companyId,
    });
    res.json(company);
  });

  router.delete("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
