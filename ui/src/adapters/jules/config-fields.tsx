import type { AdapterConfigFieldsProps } from "../types";
import { DraftInput, Field } from "@/components/agent-config-primitives";
import { JULES_OUTCOME_TEMPLATES } from "@paperclipai/adapter-jules";
export function JulesConfigFields({ isCreate, values, set, config, eff, mark }: AdapterConfigFieldsProps) {
  const get = (field: string, createValue: string) => isCreate ? createValue : eff("adapterConfig", field, String(config[field] ?? ""));
  const put = (field: string, createField: "url" | "bootstrapPrompt", value: string) => isCreate ? set?.({ [createField]: value }) : mark("adapterConfig", field, value);
  return <>
    {!isCreate && <Field label="Outcome template" hint="FounderOS validation-stage prompt contract."><select className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm" value={get("outcomeTemplate", "bootstrap")} onChange={(event) => mark("adapterConfig", "outcomeTemplate", event.target.value)}>{Object.values(JULES_OUTCOME_TEMPLATES).map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></Field>}
    <Field label="GitHub repository" hint="Canonical company repository in owner/repo format."><DraftInput value={get("repository", values?.url ?? "")} onCommit={(v) => put("repository", "url", v)} placeholder="owner/company" /></Field>
    <Field label="Jules source" hint="Jules source identifier that grants this profile repository access."><DraftInput value={get("source", values?.bootstrapPrompt ?? "")} onCommit={(v) => put("source", "bootstrapPrompt", v)} placeholder="sources/github/owner/company" /></Field>
    {!isCreate && <Field label="Starting branch"><DraftInput value={get("startingBranch", "main")} onCommit={(v) => mark("adapterConfig", "startingBranch", v)} /></Field>}
  </>;
}
