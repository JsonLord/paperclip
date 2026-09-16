export type ResourcePackTier = "core" | "domain" | "goal_specific";

export interface ResourcePackFile {
  path: string;
  purpose?: string;
  required?: boolean;
}

export interface ResourcePackManifest {
  id: string;
  version: string;
  tier: ResourcePackTier;
  purpose: string;
  files: ResourcePackFile[];
  sourceGuidance?: string;
  qualityGates: string[];
}

export interface ResourcePackSnapshot extends ResourcePackManifest {
  companyId: string;
  installedPath: string;
  sourceRepo: string;
  sourceCommit: string;
}

export interface ResolvedGoalSupportPack extends ResourcePackSnapshot {
  readPaths: string[];
}

export interface GoalSupportResolution {
  goalId: string;
  skills: string[];
  capabilities: string[];
  inputPaths: string[];
  outputPaths: string[];
  acceptanceCriteria: string[];
  cannotCompleteIf: string[];
  packs: ResolvedGoalSupportPack[];
  missingRequiredPacks: string[];
  templateProvenance?: { templateId: string; templateVersion: string; systemId: string; sourceRepository: string; sourceCommit: string };
  writeScope?: string[];
  externalActionPolicy?: string;
  firm?: { required: boolean; buildBefore: boolean; buildAfter: boolean };
}
