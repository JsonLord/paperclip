import { and, eq, sql } from "drizzle-orm";
import {
  agents,
  companies,
  validationProgrammes,
  workforceMembers,
  workforceImports,
  workforceActivations,
  activityLog,
  type Db,
} from "@paperclipai/db";
import {
  workforceOverrideSchema,
  type ValidationWorkforceDefinition,
} from "@paperclipai/shared";
import { conflict, notFound } from "../../errors.js";
import {
  canonicalWorkforce,
  definitionHash,
  validateWorkforceDefinition,
} from "./definitions.js";
const legacyMap: Record<string, string> = {
  evidence: "evidence-auditor",
  market: "market-intelligence-analyst",
  customer: "customer-investigator",
  experiment: "experiment-designer",
  sales: "lead-researcher",
  product: "prototype-director",
  business: "venture-judge",
  content: "copy-producer",
};
export function workforceImportService(db: Db) {
  async function importWorkforce(
    companyId: string,
    actorId: string,
    raw: unknown = canonicalWorkforce,
  ) {
    const definition = validateWorkforceDefinition(raw);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`workforce:${companyId}`}))`,
      );
      const [company] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, companyId));
      const [programme] = await tx
        .select()
        .from(validationProgrammes)
        .where(eq(validationProgrammes.companyId, companyId));
      if (!company || company.mode !== "idea_validation" || !programme)
        throw conflict(
          "Agency import requires an opted-in company and Validation Programme",
        );
      const native = await tx
        .select()
        .from(agents)
        .where(eq(agents.companyId, companyId));
      if (native.some((n) => ["running", "working"].includes(n.status)))
        throw conflict(
          "Stop running agents before importing or updating workforce definitions",
        );
      const members = await tx
        .select()
        .from(workforceMembers)
        .where(eq(workforceMembers.companyId, companyId));
      const newDefinitions = definition.agents.filter(
        (a) =>
          !members.some((m) => m.agencyId === a.agencyId) &&
          !native.some(
            (n) =>
              n.metadata?.agencyId === a.agencyId ||
              legacyMap[
                String(n.metadata?.founderosTemplateId ?? "").split(",")[0]
              ] === a.agencyId,
          ),
      );
      if (newDefinitions.length)
        native.push(
          ...(await tx
            .insert(agents)
            .values(
              newDefinitions.map((a) => ({
                companyId,
                name: a.name,
                role: "general",
                title: `Agency / ${a.division === "production" ? "Validation Production" : a.division}`,
                reportsTo: programme.ceoAgentId,
                status: "idle",
                adapterType: "github-actions",
                adapterConfig: {},
                runtimeConfig: {
                  heartbeat: {
                    enabled: true,
                    intervalSec: a.activation.scheduleSec,
                    wakeOnDemand: true,
                  },
                },
                capabilities: a.capabilities.join(", "),
                metadata: {
                  agencyId: a.agencyId,
                  agencySourceCommit: definition.source.commit,
                },
              })),
            )
            .returning()),
        );
      let created = 0,
        changed = 0,
        reused = 0;
      for (const a of definition.agents) {
        const prior = members.find((m) => m.agencyId === a.agencyId);
        const agent = prior
          ? native.find((n) => n.id === prior.agentId)
          : native.find(
              (n) =>
                n.metadata?.agencyId === a.agencyId ||
                legacyMap[
                  String(n.metadata?.founderosTemplateId ?? "").split(",")[0]
                ] === a.agencyId,
            );
        if (!agent)
          throw new Error(`Missing native Agency agent: ${a.agencyId}`);
        const drift =
          prior && definitionHash(prior.definition) !== definitionHash(a)
            ? "changed"
            : "current";
        if (drift === "changed") changed++;
        else if (prior) reused++;
        else created++;
        if (
          prior &&
          ["ACTIVE", "WAITING"].includes(prior.state) &&
          drift === "changed"
        )
          throw conflict(
            "Finish active work before changing its specialist definition",
          );
        await tx
          .update(agents)
          .set({
            name: a.name,
            title: `Agency / ${a.division === "production" ? "Validation Production" : a.division}`,
            reportsTo: programme.ceoAgentId,
            capabilities: a.capabilities.join(", "),
            runtimeConfig: {
              ...agent.runtimeConfig,
              heartbeat: {
                enabled: true,
                intervalSec: a.activation.scheduleSec,
                wakeOnDemand: true,
              },
            },
            metadata: {
              ...agent.metadata,
              agencyId: a.agencyId,
              agencySourceCommit: definition.source.commit,
            },
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agent.id));
        if (prior) {
          await tx
            .update(workforceMembers)
            .set({
              definition: a,
              sourceCommit: definition.source.commit,
              drift,
              updatedAt: new Date(),
            })
            .where(eq(workforceMembers.id, prior.id));
        } else
          await tx.insert(workforceMembers).values({
            companyId,
            agencyId: a.agencyId,
            agentId: agent.id,
            state: a.activation.defaultState,
            definition: a,
            sourceCommit: definition.source.commit,
          });
      }
      const removed = members.filter(
        (m) => !definition.agents.some((a) => a.agencyId === m.agencyId),
      );
      for (const m of removed) {
        if (["ACTIVE", "WAITING"].includes(m.state))
          throw conflict(
            "Finish active work before removing its upstream specialist",
          );
        await tx
          .update(workforceMembers)
          .set({
            state: "DISABLED",
            drift: "upstream_removed",
            updatedAt: new Date(),
          })
          .where(eq(workforceMembers.id, m.id));
        await tx
          .update(agents)
          .set({
            status: "paused",
            pauseReason: "Agency definition removed upstream",
            runtimeConfig: {
              heartbeat: {
                enabled: false,
                intervalSec: 0,
                wakeOnDemand: false,
              },
            },
          })
          .where(eq(agents.id, m.agentId));
      }
      const importedIds = new Set(
        (
          await tx
            .select()
            .from(workforceMembers)
            .where(eq(workforceMembers.companyId, companyId))
        ).map((m) => m.agentId),
      );
      const retired = native.filter(
        (n) =>
          n.id !== programme.ceoAgentId &&
          !importedIds.has(n.id) &&
          n.metadata?.founderosTemplateId,
      );
      for (const n of retired)
        await tx
          .update(agents)
          .set({
            status: "paused",
            pauseReason:
              "Superseded by dormant Agency validation workforce; history retained",
            runtimeConfig: {
              ...n.runtimeConfig,
              heartbeat: {
                enabled: false,
                intervalSec: 0,
                wakeOnDemand: false,
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(agents.id, n.id));
      await tx
        .insert(workforceImports)
        .values({
          companyId,
          sourceCommit: definition.source.commit,
          importerVersion: definition.importerVersion,
          definition,
        })
        .onConflictDoUpdate({
          target: workforceImports.companyId,
          set: {
            sourceCommit: definition.source.commit,
            importerVersion: definition.importerVersion,
            definition,
            importedAt: new Date(),
          },
        });
      await tx.insert(activityLog).values({
        companyId,
        actorType: "system",
        actorId,
        action: "workforce.imported",
        entityType: "company",
        entityId: companyId,
        details: {
          source: definition.source,
          importerVersion: definition.importerVersion,
          created,
          changed,
          reused,
          removed: removed.length,
          retired: retired.map((n) => n.id),
        },
      });
      return {
        source: definition.source,
        created,
        changed,
        reused,
        upstreamRemoved: removed.length,
        retired: retired.map((n) => n.id),
        activeDefinitions: definition.agents.length,
        divisions: definition.divisions.length,
      };
    });
  }
  async function roster(companyId: string) {
    return db
      .select()
      .from(workforceMembers)
      .where(eq(workforceMembers.companyId, companyId));
  }
  async function override(
    companyId: string,
    id: string,
    value: unknown,
    actorId: string,
  ) {
    const overrides = workforceOverrideSchema.parse(value);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`workforce:${companyId}`}))`,
      );
      const [m] = await tx
        .select()
        .from(workforceMembers)
        .where(
          and(
            eq(workforceMembers.companyId, companyId),
            eq(workforceMembers.id, id),
          ),
        );
      if (!m) throw notFound("Workforce member not found");
      if (["ACTIVE", "WAITING"].includes(m.state) || m.state === "WAITING")
        throw conflict("Stop active work before changing specialist policy");
      if (
        overrides.phases?.some(
          (p) => !m.definition.activation.phases.includes(p),
        )
      )
        throw conflict(
          "Phase overrides can only restrict the canonical activation policy",
        );
      if (
        overrides.restrictCapabilities?.some(
          (c) => !m.definition.capabilities.includes(c),
        )
      )
        throw conflict(
          "Capability overrides can only restrict the canonical definition",
        );
      const [row] = await tx
        .update(workforceMembers)
        .set({
          overrides,
          state: overrides.disabled
            ? "DISABLED"
            : overrides.paused
              ? "PAUSED"
              : m.definition.activation.defaultState,
          updatedAt: new Date(),
        })
        .where(eq(workforceMembers.id, id))
        .returning();
      await tx.insert(activityLog).values({
        companyId,
        actorType: "system",
        actorId,
        action: "workforce.override",
        entityType: "workforce_member",
        entityId: id,
        details: { overrides },
      });
      return row;
    });
  }
  return { importWorkforce, roster, override };
}
