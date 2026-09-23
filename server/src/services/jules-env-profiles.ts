import { julesProfiles, type Db } from "@paperclipai/db";
import type { SecretProvider } from "@paperclipai/shared";
import { SECRET_PROVIDERS } from "@paperclipai/shared";
import { secretService } from "./secrets.js";

/**
 * Jules profiles reference an API key by `secretRef`, a UUID in Paperclip's
 * encrypted secret store that `resolveSecretValue` reads company-scoped. A
 * deployment that holds its Jules keys in the environment therefore cannot use
 * them until they are imported as secrets of the company that will dispatch.
 *
 * This runs during company import, before bootstrap evaluates Jules source
 * access. Seeding afterwards would be too late: bootstrap would already have
 * found no usable profile and created every worker paused.
 */
export function julesEnvProfileService(db: Db) {
  const secrets = secretService(db);

  function defaultProvider(): SecretProvider {
    const configured = process.env.PAPERCLIP_SECRETS_PROVIDER;
    return (configured && SECRET_PROVIDERS.includes(configured as SecretProvider)
      ? configured
      : "local_encrypted") as SecretProvider;
  }

  function envKeys() {
    const found: Array<{ index: number; value: string }> = [];
    for (let index = 1; index <= 8; index += 1) {
      const value = process.env[`JULES_API_${index}`]?.trim();
      if (value) found.push({ index, value });
    }
    return found;
  }

  /** Idempotent: existing secrets and profiles are reused, never duplicated. */
  async function ensureForCompany(companyId: string, actor?: { userId?: string | null }) {
    const keys = envKeys();
    if (!keys.length) return { created: 0, reused: 0, profileIds: [] as string[] };

    const sessionStartLimit = Number(process.env.JULES_SESSION_START_LIMIT ?? 15);
    const sessionStartWindowSec = Number(process.env.JULES_SESSION_WINDOW_SEC ?? 86_400);
    const existingProfiles = await db.select().from(julesProfiles);
    const profileIds: string[] = [];
    let created = 0;
    let reused = 0;

    for (const key of keys) {
      // jules_profiles carries no companyId while secretRef is company-scoped, so
      // the name is scoped here — a bare name would look present while pointing at
      // another company's secret and fail only at dispatch. The full id is used
      // rather than a prefix: two companies sharing the first 8 characters would
      // otherwise collide and silently share one profile.
      const profileName = `jules-${companyId}-${key.index}`;
      const already = existingProfiles.find((profile) => profile.name === profileName);
      if (already) {
        profileIds.push(already.id);
        reused += 1;
        continue;
      }

      const secretName = `jules-api-${key.index}`;
      const existingSecret = await secrets.getByName(companyId, secretName);
      const secret = existingSecret ?? (await secrets.create(
        companyId,
        {
          name: secretName,
          provider: defaultProvider(),
          value: key.value,
          description: `Jules API key imported from JULES_API_${key.index}`,
        },
        { userId: actor?.userId ?? "system", agentId: null },
      ));

      const [profile] = await db
        .insert(julesProfiles)
        .values({ name: profileName, secretRef: secret.id, sessionStartLimit, sessionStartWindowSec })
        .returning();
      profileIds.push(profile.id);
      created += 1;
    }

    return { created, reused, profileIds };
  }

  return { ensureForCompany };
}
