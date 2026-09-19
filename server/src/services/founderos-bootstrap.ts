import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog, agents, companies, companyJulesSources, companyRepositoryBindings, founderosBootstraps, goals, goalTemplateInstances, issues, projectGoals, projects, resourcePackSnapshots } from "@paperclipai/db";
import { founderOsDeploymentGoalTemplates, founderOsWorkforce, validateDeploymentCatalog } from "./founderos-deployment-catalog.js";

export const FOUNDEROS_CONTEXT_VERSION = "founderos-context/v1";
export const FOUNDEROS_CONTENT_SOURCE = "JsonLord/FounderOS-DEMO";
export interface CompanyRepositoryInspection { repository: string; repositoryId?: string; defaultBranch: string; commitSha: string; paths: string[]; readText(path: string): Promise<string | null> }
export interface FounderOsRepositoryWriter { createBootstrapPullRequest(input: { repository: string; baseBranch: string; title: string; files: Record<string, string> }): Promise<{ url: string; branch: string; commitSha: string }> }
export interface FounderOsSourceResolver { resolve(repository: string): Promise<{ source: string; accessible: boolean; profileId?: string; reason?: string }> }
export interface FounderOsBootstrapOptions { contentSource?: string; contentCommit: string; repositoryWriter?: FounderOsRepositoryWriter; sourceResolver: FounderOsSourceResolver; queueInitialOutcome?: (issueId: string) => Promise<void> }

const firmConcepts = ["hypothesis","claim","evidence","experiment","customer_segment","problem","job_to_be_done","offer","value_proposition","competitor","market_estimate","assumption","decision","metric","validation_gate","account","lead","contact","interaction","opportunity","channel"];
export function founderOsBootstrapFiles(sourceCommit: string): Record<string, string> {
  const header = `# FounderOS managed context\nversion: ${FOUNDEROS_CONTEXT_VERSION}\nsource: ${FOUNDEROS_CONTENT_SOURCE}\nsource_commit: ${sourceCommit}\n`;
  const schema = (group: string, concepts: string[]) => `# FounderOS Firm schema ${group} v1\n${concepts.map((name) => `entity ${name} { id: string; status: string; source_ids: string[] }`).join("\n")}\n`;
  const files: Record<string,string> = {
    "AGENTS.md": "# FounderOS execution contract\nPaperclip owns organization and acceptance. Hermes reasons. Jules executes. Linear plans. Firm structures company knowledge. GitHub is durable memory. Never invent evidence or commit secrets.\n",
    ".founderos/JULES_CONTEXT.md": header + "\nLive Paperclip run context overrides stale organizational IDs in this repository. Unknown business facts remain hypotheses or assumptions.\n",
    ".founderos/PAPERCLIP_API.md": header + "\nUse PAPERCLIP_BASE_URL and PAPERCLIP_RUN_TOKEN when injected at runtime. Never write tokens to files. If unavailable, write idempotent events under .founderos/outbox/<runId>/.\n",
    ".founderos/TOOL_POLICY.md": header + "\nFirm state is company-local under firm/. External effects require native Paperclip approval.\n",
    ".founderos/DEPLOYMENT_POLICY.md": header + "\nPrepare artifacts and pull requests only. Publishing, deployment, spend, outreach, payments, and destructive actions require explicit approval. Never auto-merge.\n",
    ".founderos/support/manifest.yaml": `version: founderos-support/v1\ncontext_version: ${FOUNDEROS_CONTEXT_VERSION}\nsource_repository: ${FOUNDEROS_CONTENT_SOURCE}\nsource_commit: ${sourceCommit}\npacks:\n  - core.evidence-discipline@1\n  - core.goal-contract@1\n  - core.governance@1\n  - core.company-bootstrap@1\n`,
    ".founderos/outbox/.gitkeep": "",
    "firm/schemas/core.firm": schema("core", firmConcepts.slice(0, 4)),
    "firm/schemas/evidence.firm": schema("evidence", firmConcepts.slice(1, 4)),
    "firm/schemas/validation.firm": schema("validation", firmConcepts.slice(3, 15)),
    "firm/schemas/market.firm": schema("market", firmConcepts.slice(4, 10)),
    "firm/schemas/sales.firm": schema("sales", firmConcepts.slice(15)),
  };
  for (const path of ["company","strategy","market","customers","leads","interactions","opportunities","experiments","evidence","decisions"]) files[`firm/${path}.firm`] = `# ${path}: intentionally empty until supported by source evidence\n`;
  return files;
}
export function missingBootstrapFiles(paths: string[], sourceCommit: string) { const present = new Set(paths); return Object.fromEntries(Object.entries(founderOsBootstrapFiles(sourceCommit)).filter(([path]) => !present.has(path))); }

export function founderOsBootstrapService(db: Db, options: FounderOsBootstrapOptions) {
  async function bootstrap(companyId: string, repo: CompanyRepositoryInspection) {
    const company = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1).then((r) => r[0]); if (!company) throw new Error("Company not found");
    const existing = await db.select().from(founderosBootstraps).where(and(eq(founderosBootstraps.companyId, companyId), eq(founderosBootstraps.contextVersion, FOUNDEROS_CONTEXT_VERSION))).limit(1).then((r) => r[0]);
    if (existing?.nativeIds) return { bootstrap: existing, nativeIds: existing.nativeIds, idempotent: true };
    const source = await options.sourceResolver.resolve(repo.repository);
    const overview = repo.paths.includes("company/OVERVIEW.md") ? await repo.readText("company/OVERVIEW.md") : null;
    const hasWebsite = repo.paths.some((p) => p === "website" || p.startsWith("website/"));
    const missing = missingBootstrapFiles(repo.paths, options.contentCommit);
    const pullRequest = Object.keys(missing).length && options.repositoryWriter ? await options.repositoryWriter.createBootstrapPullRequest({ repository: repo.repository, baseBranch: repo.defaultBranch, title: `Install ${FOUNDEROS_CONTEXT_VERSION}`, files: missing }) : null;
    return db.transaction(async (tx) => {
      const [binding] = await tx.insert(companyRepositoryBindings).values({ companyId, repository: repo.repository, repositoryId: repo.repositoryId, defaultBranch: repo.defaultBranch, importRef: repo.defaultBranch, importCommit: repo.commitSha }).onConflictDoUpdate({ target: companyRepositoryBindings.companyId, set: { repository: repo.repository, repositoryId: repo.repositoryId, defaultBranch: repo.defaultBranch, importRef: repo.defaultBranch, importCommit: repo.commitSha, updatedAt: new Date() } }).returning();
      await tx.update(companies).set({ firmGithubRepo: repo.repository, updatedAt: new Date() }).where(eq(companies.id, companyId));
      let companySourceId: string | null = null;
      if (source.accessible) { const [bound] = await tx.insert(companyJulesSources).values({ companyId, repository: repo.repository, source: source.source, startingBranch: repo.defaultBranch, enabled: true }).onConflictDoUpdate({ target: [companyJulesSources.companyId, companyJulesSources.repository], set: { source: source.source, startingBranch: repo.defaultBranch, enabled: true, updatedAt: new Date() } }).returning(); companySourceId = bound.id; if (source.profileId) { const { julesProfileSources } = await import("@paperclipai/db"); await tx.insert(julesProfileSources).values({profileId:source.profileId,companySourceId:bound.id,status:"active",verifiedAt:new Date()}).onConflictDoNothing(); } }
      const catalog = validateDeploymentCatalog();
      if (!catalog.valid) throw new Error(`FounderOS deployment catalog is invalid: ${catalog.errors.join("; ")}`);
      const [manager] = await tx.insert(agents).values({ companyId, name: "Founder Manager", role: "ceo", title: "FounderOS Founder Manager", adapterType: "hermes_local", adapterConfig: {}, status: "idle", capabilities: "result judgment, governance, prioritization", metadata: { founderosTemplateId: "founder-manager", contextVersion: FOUNDEROS_CONTEXT_VERSION } }).returning();
      const workers = await tx.insert(agents).values(founderOsWorkforce.map((worker) => ({ companyId, name:worker.name, role:"general", title:worker.title, reportsTo:manager.id, adapterType:"jules", adapterConfig:{repository:repo.repository,source:source.accessible?source.source:"",startingBranch:repo.defaultBranch,outcomeTemplate:"bootstrap"}, status:source.accessible?"idle":"paused", pauseReason:source.accessible?null:"Jules source/profile access must be configured", capabilities:"firm, github, playwright, context7, linear", metadata:{ founderosTemplateId:[worker.key,...worker.roleAliases].join(","), contextVersion:FOUNDEROS_CONTEXT_VERSION, deploymentReady:source.accessible } }))).returning();
      const [vision] = await tx.insert(goals).values({ companyId, title:`Vision — Validate and establish a viable business around ${company.name}`, description:"Establish viability through source-backed evidence; no traction, customer, revenue, or market proof is assumed.", level:"company", status:"active", ownerAgentId:manager.id }).returning();
      const ownerFor = (role: string) => workers.find((worker) => String((worker.metadata as Record<string, unknown>)?.founderosTemplateId ?? "").includes(role)) ?? workers[0]!;
      const children = await tx.insert(goals).values(founderOsDeploymentGoalTemplates.map((template) => ({ companyId, title:template.title, description:template.objective, parentId:vision.id, level:"objective", status:template.id==="validate-problem"?"active":"planned", ownerAgentId:ownerFor(template.recommendedOwnerRole).id, requiredSkills:template.requiredSkills, supportPacks:template.supportPacks, requiredCapabilities:template.requiredCapabilities, inputPaths:template.inputPaths, outputPaths:template.outputPaths, acceptanceCriteria:template.acceptanceCriteria, cannotCompleteIf:template.cannotCompleteIf }))).returning();
      await tx.insert(goalTemplateInstances).values(children.map((goal, index) => { const template=founderOsDeploymentGoalTemplates[index]!; return {companyId,goalId:goal.id,parentGoalId:vision.id,templateId:template.id,templateVersion:template.version,systemId:template.system,sourceRepository:options.contentSource??FOUNDEROS_CONTENT_SOURCE,sourceCommit:options.contentCommit,contractSnapshot:template as unknown as Record<string,unknown>}; })).onConflictDoNothing();
      const initialGoal = children[founderOsDeploymentGoalTemplates.findIndex((template) => template.id === "validate-problem")]!;
      const initialOwner = ownerFor("customer");
      const [project] = await tx.insert(projects).values({ companyId, goalId:initialGoal.id, name:"Initial Venture Validation", description:"Evidence-first assessment of the imported overview and landing page.", status:"in_progress", leadAgentId:initialOwner.id, executionWorkspacePolicy:{repository:repo.repository,baseBranch:repo.defaultBranch} }).returning();
      await tx.insert(projectGoals).values({ companyId, projectId:project.id, goalId:initialGoal.id }).onConflictDoNothing();
      const readiness = !overview ? "Missing company/OVERVIEW.md" : !hasWebsite ? "Missing website/ landing-page source" : !source.accessible ? `Jules Source unavailable: ${source.reason ?? "access not verified"}` : null;
      const [issue] = await tx.insert(issues).values({ companyId, goalId:initialGoal.id, projectId:project.id, title:"Establish the initial evidence baseline", description:"Assess the company overview and landing page; identify unsupported claims and contradictions; initialize assumption/evidence structures; recommend the cheapest next validation step. Unknowns must remain unknown, hypotheses, or assumptions.", status:readiness ? "blocked" : "todo", priority:"high", assigneeAgentId:initialOwner.id, createdByAgentId:manager.id }).returning();
      const packs = ["core.evidence-discipline","core.goal-contract","core.governance","core.company-bootstrap"];
      for (const packId of packs) await tx.insert(resourcePackSnapshots).values({ companyId, packId, version:"1", tier:"core", installedPath:`.founderos/support/${packId}`, sourceRepo:options.contentSource ?? FOUNDEROS_CONTENT_SOURCE, sourceCommit:options.contentCommit, manifest:{id:packId,version:"1",files:Object.keys(missing).filter((p)=>p.startsWith(".founderos/")),qualityGates:["no invented facts","no secrets","source provenance required"]} }).onConflictDoNothing();
      const nativeIds = { visionGoalId:vision.id, childGoalIds:children.map((g)=>g.id), managerAgentId:manager.id, workerAgentIds:workers.map((w)=>w.id), projectId:project.id, issueId:issue.id };
      const [created] = await tx.insert(founderosBootstraps).values({ companyId, repositoryBindingId:binding.id, contextVersion:FOUNDEROS_CONTEXT_VERSION, sourceRepository:options.contentSource ?? FOUNDEROS_CONTENT_SOURCE, sourceCommit:options.contentCommit, installedCommit:pullRequest?.commitSha, status:readiness ? "blocked" : pullRequest ? "awaiting_context_pr" : "ready", nativeIds, seedInspection:{overviewPresent:Boolean(overview),websitePresent:hasWebsite,companySourceId,readiness}, drift:{missingFiles:Object.keys(missing),pullRequestUrl:pullRequest?.url} }).returning();
      await tx.insert(activityLog).values({companyId,actorType:"system",actorId:"founderos-bootstrap",action:"founderos.company.bootstrapped",entityType:"company",entityId:companyId,details:{repository:repo.repository,contextVersion:FOUNDEROS_CONTEXT_VERSION,nativeIds,readiness,pullRequestUrl:pullRequest?.url}});
      if (!readiness && options.queueInitialOutcome) await options.queueInitialOutcome(issue.id);
      return { bootstrap:created,nativeIds,idempotent:false,readiness,pullRequest };
    });
  }
  return { bootstrap };
}

export interface JulesSourceDiscoveryClient { listSources(pageToken?: string): Promise<{ items: Array<{ name: string; githubRepo?: { owner?: string; repo?: string } }>; nextPageToken?: string }> }
export function persistedJulesSourceResolver(db: Db, companyId: string, createClient: (apiKey: string) => JulesSourceDiscoveryClient) {
  return { resolve: async (repository: string) => {
    const { julesProfiles } = await import("@paperclipai/db");
    const { secretService } = await import("./secrets.js");
    const profiles = await db.select().from(julesProfiles).where(eq(julesProfiles.enabled, true));
    const [owner, name] = repository.toLowerCase().split("/");
    let found: { source: string; profileId: string } | null = null;
    for (const profile of profiles) try {
      const apiKey = await secretService(db).resolveSecretValue(companyId, profile.secretRef, "latest");
      const client = createClient(apiKey); let page: string | undefined;
      do { const result = await client.listSources(page); const match = result.items.find((item) => item.githubRepo?.owner?.toLowerCase() === owner && item.githubRepo?.repo?.toLowerCase() === name); if (match) { found={source:match.name,profileId:profile.id}; break; } page=result.nextPageToken; } while(page);
      if (found) break;
    } catch { /* an inaccessible profile is not eligible for this company */ }
    if (!found) return { source:"",accessible:false,reason:"No configured Jules profile exposes the imported GitHub repository" };
    return {source:found.source,profileId:found.profileId,accessible:true};
  }};
}
