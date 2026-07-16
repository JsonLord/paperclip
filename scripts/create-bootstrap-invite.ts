import { createHash, randomBytes } from "node:crypto";
import { createDb, invites } from "@paperclipai/db";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  return `pcp_bootstrap_${randomBytes(24).toString("hex")}`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || "postgres://paperclip:paperclip@localhost:5432/paperclip";
  const db = createDb(dbUrl);
  
  try {
    // Check if admin exists
    const adminCount = await db.select({ count: invites.id }).from(invites).limit(1).then(rows => rows.length);
    
    const token = createInviteToken();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
    
    const created = await db
      .insert(invites)
      .values({
        inviteType: "bootstrap_ceo",
        tokenHash: hashToken(token),
        allowedJoinTypes: "human",
        expiresAt,
        invitedByUserId: "system",
      })
      .returning()
      .then(rows => rows[0]);
    
    const baseUrl = process.env.PAPERCLIP_PUBLIC_URL || "http://localhost:3100";
    const inviteUrl = `${baseUrl}/invite/${token}`;
    
    console.log("Created bootstrap CEO invite.");
    console.log(`Invite URL: ${inviteUrl}`);
    console.log(`Expires: ${created.expiresAt.toISOString()}`);
  } finally {
    await (db as any).$client?.end?.({ timeout: 5 }).catch(() => undefined);
  }
}

main().catch(console.error);
