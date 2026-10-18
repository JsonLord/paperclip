import { and, eq } from "drizzle-orm";
import {
  companyRepositoryBindings,
  validationProgrammes,
  companyJulesSources,
  julesProfileSources,
  julesProfiles,
  type Db,
} from "@paperclipai/db";
import { actionsConfigSchema } from "./github-actions.js";
import { secretService } from "../secrets.js";
/** Read-only checks. Never dispatch, create a remote session or claim live access. */
export function runtimeQualificationPreflight(
  db: Db,
  resolveSecret = (companyId: string, ref: string) =>
    secretService(db).resolveSecretValue(companyId, ref, "latest"),
) {
  return async (companyId: string) => {
    const [binding] = await db
      .select()
      .from(companyRepositoryBindings)
      .where(
        and(
          eq(companyRepositoryBindings.companyId, companyId),
          eq(companyRepositoryBindings.active, true),
        ),
      );
    const [p] = await db
      .select()
      .from(validationProgrammes)
      .where(eq(validationProgrammes.companyId, companyId));
    const parsed = actionsConfigSchema.safeParse(
      p?.runtimeBindings["github-actions"],
    );
    let credentialConfigured = false;
    if (parsed.success)
      try {
        credentialConfigured = Boolean(
          await resolveSecret(companyId, parsed.data.githubSecretRef),
        );
      } catch {
        /* Readiness only; never leak provider errors or values. */
      }
    const sources = await db
      .select()
      .from(companyJulesSources)
      .where(
        and(
          eq(companyJulesSources.companyId, companyId),
          eq(companyJulesSources.enabled, true),
        ),
      );
    let julesConfigured = false;
    for (const source of sources) {
      const mappings = await db
        .select()
        .from(julesProfileSources)
        .where(
          and(
            eq(julesProfileSources.companySourceId, source.id),
            eq(julesProfileSources.status, "active"),
          ),
        );
      for (const mapping of mappings) {
        const [profile] = await db
          .select()
          .from(julesProfiles)
          .where(
            and(
              eq(julesProfiles.id, mapping.profileId),
              eq(julesProfiles.enabled, true),
            ),
          );
        if (profile)
          try {
            if (await resolveSecret(companyId, profile.secretRef))
              julesConfigured = true;
          } catch {
            /* Missing company grant is not readiness. */
          }
      }
    }
    return {
      status: "PASS_LOCAL",
      launchesRemoteWork: false,
      companyId,
      actions: {
        repositoryBound: Boolean(
          binding &&
            parsed.success &&
            binding.repository === parsed.data.repository,
        ),
        workflowConfigured: parsed.success,
        credentialConfigured,
        paperclipCorrelationSupported: "NEEDS_EXTERNAL_CHECK",
        workflowPresentOnQualificationRef: "NEEDS_EXTERNAL_CHECK",
        workflowRequiredOnDefaultBranch: true,
        defaultBranch: "master",
        defaultBranchDiscovery: "NEEDS_EXTERNAL_CHECK",
        repository: parsed.success ? parsed.data.repository : null,
        workflow: parsed.success ? parsed.data.workflow : null,
        ref: parsed.success ? parsed.data.ref : null,
      },
      jules: {
        sourceConfigured: sources.length > 0,
        credentialConfigured: julesConfigured,
        physicalStarts: 90,
        live: "PENDING_EXTERNAL",
      },
      live: { actions: "PENDING_EXTERNAL", jules: "PENDING_EXTERNAL" },
    };
  };
}
