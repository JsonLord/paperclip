import { and, desc, eq, inArray } from "drizzle-orm";
import { goalTemplateInstances, goals, resourcePackSnapshots, type Db } from "@paperclipai/db";
import type { GoalSupportResolution, ResolvedGoalSupportPack } from "@paperclipai/shared";

function joinRepoPath(root: string, child: string): string {
  return [root.replace(/^\/+|\/+$/g, ""), child.replace(/^\/+/, "")].filter(Boolean).join("/");
}

export function resolveGoalSupportFromRows(
  goal: typeof goals.$inferSelect,
  snapshots: Array<typeof resourcePackSnapshots.$inferSelect>,
): GoalSupportResolution {
  const packs: ResolvedGoalSupportPack[] = [];
  const missingRequiredPacks: string[] = [];
  for (const reference of goal.supportPacks) {
    const matching = snapshots.filter((snapshot) => snapshot.packId === reference.id && (!reference.version || snapshot.version === reference.version));
    const selected = matching[0];
    if (!selected) {
      if (reference.required !== false) missingRequiredPacks.push(reference.version ? `${reference.id}@${reference.version}` : reference.id);
      continue;
    }
    const manifest = selected.manifest as { purpose?: unknown; files?: unknown; sourceGuidance?: unknown; qualityGates?: unknown };
    const files = Array.isArray(manifest.files) ? manifest.files.filter((file): file is { path: string; purpose?: string; required?: boolean } => Boolean(file) && typeof file === "object" && typeof (file as { path?: unknown }).path === "string") : [];
    packs.push({
      id: selected.packId,
      version: selected.version,
      tier: selected.tier as ResolvedGoalSupportPack["tier"],
      purpose: typeof manifest.purpose === "string" ? manifest.purpose : selected.packId,
      files,
      sourceGuidance: typeof manifest.sourceGuidance === "string" ? manifest.sourceGuidance : undefined,
      qualityGates: Array.isArray(manifest.qualityGates) ? manifest.qualityGates.filter((gate): gate is string => typeof gate === "string") : [],
      companyId: selected.companyId,
      installedPath: selected.installedPath,
      sourceRepo: selected.sourceRepo,
      sourceCommit: selected.sourceCommit,
      readPaths: files.filter((file) => file.required !== false).map((file) => joinRepoPath(selected.installedPath, file.path)),
    });
  }
  return {
    goalId: goal.id,
    skills: goal.requiredSkills,
    capabilities: goal.requiredCapabilities,
    inputPaths: goal.inputPaths,
    outputPaths: goal.outputPaths,
    acceptanceCriteria: goal.acceptanceCriteria,
    cannotCompleteIf: goal.cannotCompleteIf,
    packs,
    missingRequiredPacks,
  };
}

export function goalSupportService(db: Db) {
  return {
    install: async (companyId: string, input: { manifest: Record<string, unknown> & { id: string; version: string; tier: string }; installedPath: string; sourceRepo: string; sourceCommit: string }) =>
      db.insert(resourcePackSnapshots).values({ companyId, packId: input.manifest.id, version: input.manifest.version, tier: input.manifest.tier, installedPath: input.installedPath, sourceRepo: input.sourceRepo, sourceCommit: input.sourceCommit, manifest: input.manifest }).onConflictDoUpdate({ target: [resourcePackSnapshots.companyId, resourcePackSnapshots.packId, resourcePackSnapshots.version], set: { tier: input.manifest.tier, installedPath: input.installedPath, sourceRepo: input.sourceRepo, sourceCommit: input.sourceCommit, manifest: input.manifest, installedAt: new Date() } }).returning().then((rows) => rows[0]),
    list: (companyId: string) => db.select().from(resourcePackSnapshots).where(eq(resourcePackSnapshots.companyId, companyId)).orderBy(desc(resourcePackSnapshots.installedAt)),
    resolve: async (goalId: string) => {
      const goal = await db.select().from(goals).where(eq(goals.id, goalId)).then((rows) => rows[0] ?? null);
      if (!goal) return null;
      const ids = [...new Set(goal.supportPacks.map((pack) => pack.id))];
      const snapshots = ids.length ? await db.select().from(resourcePackSnapshots).where(and(eq(resourcePackSnapshots.companyId, goal.companyId), inArray(resourcePackSnapshots.packId, ids))).orderBy(desc(resourcePackSnapshots.installedAt)) : [];
      const provenance = await db.select().from(goalTemplateInstances).where(eq(goalTemplateInstances.goalId, goalId)).limit(1).then((rows) => rows[0] ?? null);
      const resolution = resolveGoalSupportFromRows(goal, snapshots);
      if (provenance) {
        const contract = provenance.contractSnapshot as { writeScope?: string[]; externalActionPolicy?: string; firm?: { required: boolean; buildBefore: boolean; buildAfter: boolean } };
        resolution.templateProvenance = { templateId: provenance.templateId, templateVersion: provenance.templateVersion, systemId: provenance.systemId, sourceRepository: provenance.sourceRepository, sourceCommit: provenance.sourceCommit };
        resolution.writeScope = contract.writeScope ?? [];
        resolution.externalActionPolicy = contract.externalActionPolicy;
        resolution.firm = contract.firm;
      }
      return { companyId: goal.companyId, resolution };
    },
  };
}
