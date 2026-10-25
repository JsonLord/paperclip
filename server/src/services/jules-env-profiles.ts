import { eq } from "drizzle-orm";
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

  /**
   * What a profile can actually do.
   *
   * A profile seeded from the environment declared nothing, and the broker requires
   * every capability a goal asks for to be listed AND not marked missing — so an empty
   * list denied every dispatch that asked for anything at all. `github` is always true
   * of a profile with a bound source: reaching the company repository is the whole
   * point of the binding. Everything else is an MCP server the operator configures in
   * their own Jules account, which this deployment cannot verify, so it is declared
   * here rather than assumed.
   */
  function declaredCapabilities(): string[] {
    const configured = (process.env.JULES_PROFILE_CAPABILITIES ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(["github", ...configured])];
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
    if (!keys.length) return { created: 0, reused: 0, rotated: 0, unreadable: 0, profileIds: [] as string[] };

    const sessionStartLimit = Number(process.env.JULES_SESSION_START_LIMIT ?? 15);
    const sessionStartWindowSec = Number(process.env.JULES_SESSION_WINDOW_SEC ?? 86_400);
    // Opt-in: push the current env value as a new version when a key was rotated in the
    // deployment's settings. Off by default so a restart loop does not pile up versions.
    const rotateExisting = /^(1|true|yes)$/i.test(process.env.JULES_SEED_ROTATE ?? "");
    const capabilities = declaredCapabilities();
    const existingProfiles = await db.select().from(julesProfiles);
    const profileIds: string[] = [];
    let created = 0;
    let reused = 0;
    let rotated = 0;
    let unreadable = 0;

    for (const key of keys) {
      const secretName = `jules-api-${key.index}`;
      // jules_profiles carries no companyId while secretRef is company-scoped, so the
      // name is scoped here — a bare name would look present while pointing at another
      // company's secret and fail only at dispatch. The full id is used rather than a
      // prefix: two companies sharing the first 8 characters would otherwise collide
      // and silently share one profile.
      const profileName = `jules-${companyId}-${key.index}`;
      const existingSecret = await secrets.getByName(companyId, secretName);
      if (existingSecret) {
        // A secret sealed with a master key this deployment no longer has cannot be
        // read back, and the profile pointing at it reports "API key not available to
        // this company" forever. The environment still holds the true value, so
        // re-seal it with the current key rather than leaving the profile dead.
        const readable = await secrets
          .resolveSecretValue(companyId, existingSecret.id, "latest")
          .then(() => true)
          .catch(() => false);
        if (!readable || rotateExisting) {
          await secrets.rotate(existingSecret.id, { value: key.value }, { userId: actor?.userId ?? "system", agentId: null });
          rotated += 1;
          if (!readable) unreadable += 1;
        }
      }
      // Adopt by secretRef before name. A profile pointing at this company's key is this
      // company's profile whatever it is called, so an earlier deployment's naming does
      // not produce a second profile for the same key.
      const already = (existingSecret && existingProfiles.find((profile) => profile.secretRef === existingSecret.id))
        ?? existingProfiles.find((profile) => profile.name === profileName);
      if (already) {
        profileIds.push(already.id);
        reused += 1;
        // A profile seeded before this deployment declared its capabilities keeps an
        // empty list forever otherwise, and an empty list denies everything. Widen it
        // in place; never narrow it, so a capability granted through the API is not
        // taken away by a restart.
        const merged = [...new Set([...(already.capabilities ?? []), ...capabilities])];
        if (merged.length !== (already.capabilities ?? []).length) {
          await db.update(julesProfiles).set({ capabilities: merged, updatedAt: new Date() }).where(eq(julesProfiles.id, already.id));
        }
        continue;
      }

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
        .values({ name: profileName, secretRef: secret.id, sessionStartLimit, sessionStartWindowSec, capabilities })
        .returning();
      profileIds.push(profile.id);
      created += 1;
    }

    return { created, reused, rotated, unreadable, profileIds };
  }

  return { ensureForCompany };
}
