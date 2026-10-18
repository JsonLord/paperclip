import { createHash } from "node:crypto";
import catalog from "./catalog/agency-validation-workforce.json" with { type: "json" };
import {
  workforceDefinitionSchema,
  type ValidationWorkforceDefinition,
} from "@paperclipai/shared";
export function definitionHash(value: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v,
      ),
    )
    .digest("hex");
}
export function validateWorkforceDefinition(
  input: unknown,
): ValidationWorkforceDefinition {
  const data = workforceDefinitionSchema.parse(input);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`Duplicate ${label}`);
  };
  unique(
    data.agents.map((a) => a.agencyId),
    "Agency IDs",
  );
  unique(data.divisions, "divisions");
  unique(
    data.capabilities.map((c) => c.id),
    "capabilities",
  );
  unique(
    data.skills.map((s) => s.id),
    "skills",
  );
  unique(
    data.workflows.map((w) => w.id),
    "workflows",
  );
  const ids = new Set(data.agents.map((a) => a.agencyId)),
    skills = new Set(data.skills.map((s) => s.id)),
    caps = new Set(data.capabilities.map((c) => c.id));
  const aliases = new Set<string>();
  for (const path of Object.values(data.sourceAliases))
    if (
      path.startsWith("agents/") &&
      !data.agents.some((a) => a.sourcePath === path)
    )
      throw new Error("Source alias references unknown active persona");
  for (const a of data.agents) {
    if (!data.divisions.includes(a.division))
      throw new Error(`Unknown division: ${a.agencyId}`);
    if (
      a.skills.some((s) => !skills.has(s)) ||
      a.capabilities.some((c) => !caps.has(c))
    )
      throw new Error(`Missing skill/capability: ${a.agencyId}`);
    if (
      a.agencyId !== "founder-intelligence-reporter" &&
      (a.activation.defaultState !== "DORMANT" ||
        a.activation.scheduleSec !== 0)
    )
      throw new Error("Specialists must be dormant without timer heartbeats");
    for (const alias of [a.agencyId, ...a.aliases]) {
      if (aliases.has(alias)) throw new Error(`Duplicate alias: ${alias}`);
      aliases.add(alias);
    }
    if (
      a.methodology.successCriteria.some((x) =>
        /\b[3-9]\+|at least [3-9]/i.test(x),
      )
    )
      throw new Error(
        "Quantity-based success criteria are not operational KPIs",
      );
  }
  for (const c of data.capabilities)
    if (c.agentIds.some((id) => !ids.has(id)))
      throw new Error("Capability references missing specialist");
  for (const w of data.workflows) {
    const seen = new Set<string>();
    for (const s of w.steps) {
      if (
        !ids.has(s.agencyId) ||
        s.skills.some((id) => !skills.has(id)) ||
        seen.has(s.id) ||
        s.dependsOn.some((id) => !seen.has(id))
      )
        throw new Error(`Invalid playbook step: ${w.id}/${s.id}`);
      seen.add(s.id);
    }
  }
  return data;
}
export const canonicalWorkforce = validateWorkforceDefinition(catalog);
