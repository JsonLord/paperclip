import type { AdapterConfigFieldsProps } from "../types";
import { DraftInput, DraftNumberInput, Field, ToggleField, help } from "@/components/agent-config-primitives";

export function HermesLocalConfigFields(props: AdapterConfigFieldsProps) {
  const { isCreate, values, set, config, eff, mark, models } = props;
  const value = <T,>(field: string, fallback: T) =>
    isCreate ? fallback : eff("adapterConfig", field, (config[field] as T | undefined) ?? fallback);
  const update = (field: string, next: unknown) => {
    if (isCreate) set?.({ [field]: next });
    else mark("adapterConfig", field, next);
  };

  return (
    <>
      <Field label="Model" hint="Provider/model identifier used by Hermes.">
        <select
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm"
          value={isCreate ? values?.model ?? "" : value("model", "")}
          onChange={(event) => update("model", event.target.value)}
        >
          <option value="">Hermes default</option>
          {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select>
      </Field>
      <Field label="Working directory" hint={help.cwd}>
        <DraftInput value={isCreate ? values?.cwd ?? "" : value("cwd", "")} onCommit={(next) => update("cwd", next)} placeholder="/absolute/path/to/workspace" />
      </Field>
      <Field label="Hermes command" hint="Override only when Hermes is not available as `hermes` on PATH.">
        <DraftInput value={isCreate ? values?.command ?? "" : value("hermesCommand", "hermes")} onCommit={(next) => update(isCreate ? "command" : "hermesCommand", next)} placeholder="hermes" />
      </Field>
      {!isCreate && (
        <>
          <Field label="Timeout (seconds)" hint={help.timeout}>
            <DraftNumberInput value={value("timeoutSec", 300)} onCommit={(next) => update("timeoutSec", next)} min={0} />
          </Field>
          <ToggleField label="Persistent session" hint="Resume the manager's Hermes session between heartbeats." checked={value("persistSession", true)} onChange={(next) => update("persistSession", next)} />
        </>
      )}
    </>
  );
}
