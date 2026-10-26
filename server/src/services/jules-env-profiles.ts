import { eq } from "drizzle-orm";
import { julesProfiles, type Db } from "@paperclipai/db";
import type { SecretProvider } from "@paperclipai/shared";
import { SECRET_PROVIDERS } from "@paperclipai/shared";
import { secretService } from "./secrets.js";

type ManagedLimits = Partial<
  Pick<
    typeof julesProfiles.$inferInsert,
    "sessionStartLimit" | "sessionStartWindowSec" | "concurrentSessionLimit"
  >
>;

function configuredPositiveInteger(
  env: NodeJS.ProcessEnv,
  names: string[],
): number | undefined {
  const name = names.find((entry) => env[entry]?.trim());
  if (!name) return undefined;
  const text = env[name]!.trim();
  const value = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new Error(`${name} must be a positive PostgreSQL integer`);
  }
  return value;
}

/** Numeric suffixes identify credentials; they do not imply quota or plan. */
export function readJulesEnvironmentProfiles(
  env: NodeJS.ProcessEnv = process.env,
) {
  return Object.entries(env)
    .flatMap(([name, raw]) => {
      const match = /^JULES_API_([1-9]\d*)$/.exec(name);
      if (!match || !raw?.trim()) return [];
      const index = Number(match[1]);
      if (!Number.isSafeInteger(index))
        throw new Error("Jules credential suffix must be a safe integer");
      const limits: ManagedLimits = {};
      const settings = [
        ["sessionStartLimit", "JULES_SESSION_START_LIMIT"],
        ["sessionStartWindowSec", "JULES_SESSION_WINDOW_SEC"],
        ["concurrentSessionLimit", "JULES_CONCURRENT_SESSION_LIMIT"],
      ] as const;
      for (const [field, setting] of settings) {
        const value = configuredPositiveInteger(env, [
          `${setting}_${index}`,
          setting,
        ]);
        if (value !== undefined) limits[field] = value;
      }
      return [{ index, value: raw.trim(), limits }];
    })
    .sort((a, b) => a.index - b.index);
}

/**
 * Per-company rolling session-start limit override, expressed as environment
 * (`companyId=90;other=30`). Unlike the generic `JULES_SESSION_START_LIMIT` (which
 * would hit every company's profile) this is scoped to a single company, so setting
 * it for AUX never narrows or widens Humanise or any other company. Strictly
 * validated like the per-index limits above; a malformed value throws so a typo
 * fails the boot seed loudly rather than silently applying the wrong cap. Applied
 * onto the parent's existing create AND reconcile-on-adopt paths, so it survives
 * the space's every-boot DB restore without any profile PATCH route (there is none).
 */
function parseCompanyStartLimitOverride(raw: string | undefined, companyId: string): number | undefined {
  for (const entry of (raw ?? "").split(";")) {
    const sep = entry.indexOf("=");
    if (sep < 0) continue;
    const company = entry.slice(0, sep).trim();
    const value = entry.slice(sep + 1).trim();
    if (company !== companyId) continue;
    const num = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(num) || num < 1 || num > 2_147_483_647) {
      throw new Error(`JULES_SESSION_START_LIMIT_OVERRIDES must map ${companyId} to a positive PostgreSQL integer`);
    }
    return num;
  }
  return undefined;
}

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
    return (
      configured && SECRET_PROVIDERS.includes(configured as SecretProvider)
        ? configured
        : "local_encrypted"
    ) as SecretProvider;
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

  /** Idempotent: existing secrets and profiles are reused, never duplicated. */
  async function ensureForCompany(
    companyId: string,
    actor?: { userId?: string | null },
  ) {
    // Validate all configured limits before creating or rotating any secret.
    const keys = readJulesEnvironmentProfiles();
    // Per-company rolling start limit (see parseCompanyStartLimitOverride). Folded into
    // each key's limits so the parent's existing create + reconcile-on-adopt paths pick
    // it up unchanged; scoped to this company so no other company's profile moves.
    const companyStartLimit = parseCompanyStartLimitOverride(
      process.env.JULES_SESSION_START_LIMIT_OVERRIDES,
      companyId,
    );
    if (!keys.length)
      return {
        created: 0,
        reused: 0,
        rotated: 0,
        unreadable: 0,
        profileIds: [] as string[],
      };

    // Opt-in: push the current env value as a new version when a key was rotated in the
    // deployment's settings. Off by default so a restart loop does not pile up versions.
    const rotateExisting = /^(1|true|yes)$/i.test(
      process.env.JULES_SEED_ROTATE ?? "",
    );
    const capabilities = declaredCapabilities();
    const existingProfiles = await db.select().from(julesProfiles);
    const profileIds: string[] = [];
    let created = 0;
    let reused = 0;
    let rotated = 0;
    let unreadable = 0;

    for (const key of keys) {
      const effectiveLimits: ManagedLimits = { ...key.limits };
      if (companyStartLimit !== undefined) effectiveLimits.sessionStartLimit = companyStartLimit;
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
          await secrets.rotate(
            existingSecret.id,
            { value: key.value },
            { userId: actor?.userId ?? "system", agentId: null },
          );
          rotated += 1;
          if (!readable) unreadable += 1;
        }
      }
      // Adopt by secretRef before name. A profile pointing at this company's key is this
      // company's profile whatever it is called, so an earlier deployment's naming does
      // not produce a second profile for the same key.
      const already =
        (existingSecret &&
          existingProfiles.find(
            (profile) => profile.secretRef === existingSecret.id,
          )) ??
        existingProfiles.find((profile) => profile.name === profileName);
      if (already) {
        profileIds.push(already.id);
        reused += 1;
        // A profile seeded before this deployment declared its capabilities keeps an
        // empty list forever otherwise, and an empty list denies everything. Widen it
        // in place; never narrow it, so a capability granted through the API is not
        // taken away by a restart.
        const merged = [
          ...new Set([...(already.capabilities ?? []), ...capabilities]),
        ];
        const limitsChanged = Object.entries(effectiveLimits).some(
          ([field, value]) => already[field as keyof ManagedLimits] !== value,
        );
        if (
          limitsChanged ||
          merged.length !== (already.capabilities ?? []).length
        ) {
          // Preserve profile id, usage history, health, enabled state and all limits
          // that the operator has not explicitly configured in the environment.
          await db
            .update(julesProfiles)
            .set({ ...effectiveLimits, capabilities: merged, updatedAt: new Date() })
            .where(eq(julesProfiles.id, already.id));
        }
        continue;
      }

      const secret =
        existingSecret ??
        (await secrets.create(
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
        .values({
          name: profileName,
          secretRef: secret.id,
          sessionStartLimit: 15,
          sessionStartWindowSec: 86_400,
          concurrentSessionLimit: 3,
          ...effectiveLimits,
          capabilities,
        })
        .returning();
      profileIds.push(profile.id);
      created += 1;
    }

    return { created, reused, rotated, unreadable, profileIds };
  }

  return { ensureForCompany };
}
