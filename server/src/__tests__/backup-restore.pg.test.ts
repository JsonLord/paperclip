import { existsSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { applyPendingMigrations, agents, companies, createDb, dispatchIntents, heartbeatRuns, type Db } from "@paperclipai/db";
import { dispatchLedgerService } from "../services/dispatch-ledger.js";

// GATE05-R WP5: restart-during-dispatch durability against the HF backup policy
// (deploy/hf-space/overlay/deploy/backup.sh): the restore dump excludes
// heartbeat_runs DATA while dispatch_intents ships in full. A container rebuild
// must therefore still know which activations were in flight and which runs
// they referenced — via the durable ledger plus the diagnostics correlation
// export — and must NEVER re-wake an agent from a replayed activation key.
//
// Branches, both with identical assertions:
//  - REAL pg_dump + psql when PostgreSQL client binaries are present (CI).
//  - Otherwise a clearly-named policy-equivalent SQL restore: schema rebuild via
//    applyPendingMigrations plus a selective copy of the INCLUDED data tables,
//    leaving the excluded-data tables empty exactly as the policy dictates.
//    This branch proves the policy interaction, not pg_dump's own behavior;
//    pg_dump fidelity is covered by the CI branch. Gated on DATABASE_URL
//    (NOT_RUN without a real PostgreSQL). Never uses provider sessions.

const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

function findPgClientBin(): string | null {
  try {
    const root = new URL("../../../node_modules/.pnpm/", import.meta.url).pathname;
    const dir = readdirSync(root).find((d) => d.startsWith("@embedded-postgres+linux-x64@"));
    if (!dir) return null;
    const bin = `${root}${dir}/node_modules/@embedded-postgres/linux-x64/native/bin`;
    return existsSync(`${bin}/pg_dump`) && existsSync(`${bin}/psql`) ? bin : null;
  } catch {
    return null;
  }
}

function connStr(dbName: string) {
  return url!.replace(/\/[^/]+$/, `/${dbName}`);
}

suite("backup/restore dispatch durability (real PostgreSQL)", () => {
  const pgBin = url ? findPgClientBin() : null;
  const dbName = url ? `restore_${randomUUID().slice(0, 8)}` : "";
  const companyId = url ? randomUUID() : "";
  const agentId = url ? randomUUID() : "";
  const failedRunId = url ? randomUUID() : ""; // oct-24 style pre-allocation failure
  const inflightRunId = url ? randomUUID() : ""; // restart-during-dispatch case
  const replayKey = `wp5-${randomUUID()}`;
  const failedKey = `wp5f-${randomUUID()}`;
  let admin: Db;
  let src: Db;

  beforeAll(async () => {
    if (!url) return;
    await applyPendingMigrations(url);
    admin = createDb(url);
    await admin.execute(sql.raw(`CREATE DATABASE ${dbName}`));
    await applyPendingMigrations(connStr(dbName));
    src = createDb(connStr(dbName));
    await src.insert(companies).values({ id: companyId, name: `wp5-${companyId.slice(0, 6)}`, issuePrefix: `W${companyId.slice(0, 4).toUpperCase()}` });
    await src.insert(agents).values({ id: agentId, companyId, name: "wp5-probe-agent" });
    await src.insert(heartbeatRuns).values([
      { id: failedRunId, companyId, agentId, status: "failed", errorCode: "jules_auth_required", error: "No eligible profile has an accessible credential", sessionIdBefore: null, sessionIdAfter: null, startedAt: new Date(), finishedAt: new Date() },
      { id: inflightRunId, companyId, agentId, status: "running", startedAt: new Date() },
    ]);
    const svc = dispatchLedgerService(src);
    const f = await svc.recordIntent({ companyId, agentId, activationKey: failedKey, fencingToken: 1, controllerId: "wp5" });
    await svc.transition({ id: f.intent.id, fromState: "INTENT", toState: "DISPATCHED", runId: failedRunId });
    await svc.transition({ id: f.intent.id, fromState: "DISPATCHED", toState: "FAILED", errorCode: "jules_auth_required", externalSessionId: null });
    const i = await svc.recordIntent({ companyId, agentId, activationKey: replayKey, fencingToken: 1, controllerId: "wp5" });
    await svc.transition({ id: i.intent.id, fromState: "INTENT", toState: "DISPATCHED", runId: inflightRunId });
  }, 180_000);

  it("correlation query keeps the exact runs recovery must reconcile", async () => {
    const rows = await src.execute(sql`select json_agg(r) as j from (select h.id, h.status, h.error_code, h.session_id_before, h.session_id_after
        from heartbeat_runs h where h.company_id=${companyId}
        and (h.id in (select run_id from dispatch_intents where company_id=${companyId} and run_id is not null)
             or h.status in ('queued','running')) order by h.started_at desc limit 200) r`);
    const raw = (rows as unknown as { j: unknown }[])[0]?.j;
    const list = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? [])) as { id: string; status: string; error_code: string | null }[];
    const ids = list.map((r) => r.id).sort();
    expect(ids).toEqual([failedRunId, inflightRunId].sort());
    const failedRow = list.find((r) => r.id === failedRunId)!;
    expect(failedRow.status).toBe("failed");
    expect(failedRow.error_code).toBe("jules_auth_required");
  });

  it("restore (policy-shaped) preserves the ledger, drops run data, and replay stays REPLAY", async () => {
    const restoredName = `${dbName}_r`;
    await admin.execute(sql.raw(`CREATE DATABASE ${restoredName}`));

    if (pgBin) {
      // CI branch: real dump with the EXACT exclusion flag list from backup.sh.
      const { execFileSync } = await import("node:child_process");
      const pgEnv = { ...process.env, LD_LIBRARY_PATH: pgBin.replace(/bin$/, "lib") };
      const dump = execFileSync(`${pgBin}/pg_dump`, [
        "--no-owner", "--no-privileges",
        "--exclude-table-data=heartbeat_runs",
        "--exclude-table-data=workspace_operations",
        "--exclude-table-data=activity",
        "--exclude-table-data=activity_log",
        "--exclude-table-data=session",
        "--exclude-table-data=jules_session_activities",
        "--exclude-table-data=jules_callback_events",
        "--exclude-table-data=jules_capacity_events",
        connStr(dbName),
      ], { env: pgEnv, maxBuffer: 128 * 1024 * 1024 });
      execFileSync(`${pgBin}/psql`, ["-f", "-", connStr(restoredName)], { env: pgEnv, input: dump, maxBuffer: 128 * 1024 * 1024 });
    } else {
      // Local branch: policy-equivalent SQL restore. Schema rebuilt from
      // migrations; data copied ONLY from tables the dump includes (the
      // excluded-data tables are intentionally left empty).
      await applyPendingMigrations(connStr(restoredName));
      const dst0 = createDb(connStr(restoredName));
      for (const row of await src.select().from(companies)) await dst0.insert(companies).values(row);
      for (const row of await src.select().from(agents)) await dst0.insert(agents).values(row);
      for (const row of await src.select().from(dispatchIntents)) await dst0.insert(dispatchIntents).values(row);
      // heartbeat_runs deliberately NOT copied: excluded-table-data by policy.
    }

    const dst = createDb(connStr(restoredName));
    const kept = await dst.select().from(dispatchIntents).where(and(eq(dispatchIntents.activationKey, replayKey)));
    expect(kept).toHaveLength(1);
    expect(kept[0].state).toBe("DISPATCHED");
    expect(String(kept[0].runId)).toBe(inflightRunId);
    const runs = await dst.select().from(heartbeatRuns).where(eq(heartbeatRuns.companyId, companyId));
    expect(runs).toHaveLength(0); // documented policy: run DATA is excluded by design
    // End-to-end idempotency across a simulated container rebuild:
    const svc = dispatchLedgerService(dst);
    const replay = await svc.recordIntent({ companyId, agentId, activationKey: replayKey, fencingToken: 1, controllerId: "wp5-new" });
    expect(replay.kind).toBe("REPLAY");
    expect(replay.intent.state).toBe("DISPATCHED");
  }, 180_000);

  it("cleanup", async () => {
    if (admin) {
      await admin.execute(sql.raw(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`)).catch(() => undefined);
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${dbName}`)).catch(() => undefined);
      await admin.execute(sql.raw(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}_r' AND pid <> pg_backend_pid()`)).catch(() => undefined);
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${dbName}_r`)).catch(() => undefined);
    }
  });
});
