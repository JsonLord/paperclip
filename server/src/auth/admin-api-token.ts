import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { authUsers, instanceUserRoles, type Db } from "@paperclipai/db";

/** Optional server-managed board credential, separate from Better Auth signing keys. */
export async function resolveAdminApiToken(db: Db, supplied: string) {
  const configured = process.env.PAPERCLIP_ADMIN_API_TOKEN?.trim();
  const email = process.env.PAPERCLIP_ADMIN_API_EMAIL?.trim();
  if (!configured || configured.length < 32 || !email) return null;
  if ([process.env.BETTER_AUTH_SECRET, process.env.PAPERCLIP_AGENT_JWT_SECRET,
    process.env.PAPERCLIP_ADMIN_PASSWORD].some((secret) => secret && secret === configured)) return null;
  // Fixed-size digests avoid both early string comparison and unequal-length errors.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(configured), digest(supplied))) return null;
  const users = await db.select({ id: authUsers.id }).from(authUsers)
    .where(eq(authUsers.email, email)).limit(2);
  if (users.length !== 1) return null;
  const [role] = await db.select({ id: instanceUserRoles.id }).from(instanceUserRoles)
    .where(and(eq(instanceUserRoles.userId, users[0].id), eq(instanceUserRoles.role, "instance_admin")))
    .limit(1);
  return role ? users[0].id : null;
}
