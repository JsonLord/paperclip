import { documentService } from "../services/documents.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { createRequire } from "node:module";
// Reuse the DB package's existing PostgreSQL client dependency; no manifest/lockfile change.
const postgres = createRequire(
  new URL("../../../packages/db/package.json", import.meta.url),
)("postgres");
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  activityLog,
  agents,
  applyPendingMigrations,
  companies,
  companyJulesSources,
  heartbeatRuns,
  issues,
  issueWorkProducts,
  julesProfiles,
  julesSessions,
  type Db,
} from "@paperclipai/db";
import { registerJulesCompletion } from "../services/jules-completion.js";
import { julesSessionService } from "../services/jules-sessions.js";
let instance: EmbeddedPostgres;
let sql: ReturnType<typeof postgres>;
let db: Db;
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "agency-completion-integration-"));
  const port = await new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const p = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(p));
    });
  });
  instance = new EmbeddedPostgres({
    databaseDir: dir,
    user: "test",
    password: "test",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
  await instance.initialise();
  await instance.start();
  const url = `postgres://test:test@127.0.0.1:${port}/postgres`;
  await applyPendingMigrations(url);
  sql = postgres(url, { max: 10 });
  db = drizzle(sql) as unknown as Db;
}, 60000);
afterAll(async () => {
  await sql?.end();
  await instance?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
}, 30000);
describe("real PostgreSQL durable late-completion registration", () => {
  it("native document revision CAS permits one concurrent activation journal owner", async () => {
    const companyId = randomUUID(),
      issueId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "CAS test", issuePrefix: "CAS" });
    await db
      .insert(issues)
      .values({
        id: issueId,
        companyId,
        title: "Supervisor control",
        status: "backlog",
      });
    const service = documentService(db);
    const first = await service.upsertIssueDocument({
      issueId,
      key: "agency-supervisor",
      format: "markdown",
      body: "initial",
    });
    const results = await Promise.allSettled(
      ["owner-one", "owner-two"].map((body) =>
        service.upsertIssueDocument({
          issueId,
          key: "agency-supervisor",
          format: "markdown",
          body,
          baseRevisionId: first.document.latestRevisionId,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const current = await service.getIssueDocumentByKey(
      issueId,
      "agency-supervisor",
    );
    expect(current?.latestRevisionNumber).toBe(2);
  });

  it("survives a new service instance and concurrent polls without duplicate products or review events", async () => {
    const [c, a, i, r, p, s, j] = Array.from({ length: 7 }, randomUUID);
    await db.insert(companies).values({ id: c, name: "Integration only", issuePrefix: "LATE" });
    await db.insert(agents).values({
      id: a,
      companyId: c,
      name: "Agency",
      role: "general",
      adapterType: "jules",
    });
    await db.insert(issues).values({
      id: i,
      companyId: c,
      title: "Synthetic late completion",
      status: "todo",
    });
    await db.insert(heartbeatRuns).values({
      id: r,
      companyId: c,
      agentId: a,
      status: "succeeded",
      invocationSource: "on_demand",
    });
    await db
      .insert(julesProfiles)
      .values({ id: p, name: "Integration profile", secretRef: randomUUID() });
    await db.insert(companyJulesSources).values({
      id: s,
      companyId: c,
      repository: "owner/repo",
      source: "sources/owner/repo",
      startingBranch: "main",
    });
    await db.insert(julesSessions).values({
      id: j,
      companyId: c,
      profileId: p,
      companySourceId: s,
      paperclipRunId: r,
      julesSessionId: "remote-one",
      agentId: a,
      issueId: i,
      status: "IN_PROGRESS",
    });
    expect(await registerJulesCompletion(db, j)).toBeNull();
    // Heartbeat is already terminal; a new durable lifecycle instance sees the remote PR later.
    const [session] = await db
      .select()
      .from(julesSessions)
      .where(eq(julesSessions.id, j));
    await julesSessionService(db).reconcile(session, {
      getSession: async () => ({
        id: "remote-one",
        state: "COMPLETED",
        outputs: [
          { pullRequest: { url: "https://github.com/owner/repo/pull/14" } },
        ],
      }),
      listActivities: async () => ({ items: [] }),
    });
    const [staleCompleted] = await db
      .select()
      .from(julesSessions)
      .where(eq(julesSessions.id, j));
    await Promise.all(
      Array.from({ length: 10 }, () => registerJulesCompletion(db, j)),
    );
    // A poll started before registration must not erase its journal bit with stale JSON.
    await julesSessionService(db).reconcile(staleCompleted, {
      getSession: async () => ({
        id: "remote-one",
        state: "COMPLETED",
        outputs: [
          { pullRequest: { url: "https://github.com/owner/repo/pull/14" } },
        ],
      }),
      listActivities: async () => ({ items: [] }),
    });
    await registerJulesCompletion(db, j);
    expect(
      await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.issueId, i)),
    ).toHaveLength(1);
    expect(
      await db.select().from(activityLog).where(eq(activityLog.companyId, c)),
    ).toHaveLength(1);
    expect(
      (await db.select().from(issues).where(eq(issues.id, i)))[0].status,
    ).toBe("in_review");
    const [product] = await db
      .select()
      .from(issueWorkProducts)
      .where(eq(issueWorkProducts.issueId, i));
    expect(product.metadata).toMatchObject({
      remoteSessionId: "remote-one",
      paperclipRunId: r,
      accepted: false,
      validation: { verdict: "REVIEW_REQUIRED" },
    });
  }, 30000);
});
