import { z } from "zod";

const safeRelativePath = z.string().min(1).refine((path) => !path.startsWith("/") && !path.split("/").includes(".."), "must be a safe repository-relative path");
export const resourcePackManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  tier: z.enum(["core", "domain", "goal_specific"]),
  purpose: z.string().min(1),
  files: z.array(z.object({ path: safeRelativePath, purpose: z.string().optional(), required: z.boolean().default(true) })).min(1),
  sourceGuidance: z.string().optional(),
  qualityGates: z.array(z.string().min(1)).default([]),
});
export const installResourcePackSchema = z.object({
  manifest: resourcePackManifestSchema,
  installedPath: safeRelativePath,
  sourceRepo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  sourceCommit: z.string().regex(/^[0-9a-f]{7,64}$/i),
});
export type InstallResourcePack = z.infer<typeof installResourcePackSchema>;
