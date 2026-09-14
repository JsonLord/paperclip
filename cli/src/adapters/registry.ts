import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printJulesStreamEvent } from "@paperclipai/adapter-jules/cli";
import { printHermesStreamEvent } from "./hermes-local.js";

const hermesAdapter: CLIAdapterModule = { type: "hermes_local", formatStdoutEvent: printHermesStreamEvent };
const julesAdapter: CLIAdapterModule = { type: "jules", formatStdoutEvent: printJulesStreamEvent };
const adaptersByType = new Map([hermesAdapter, julesAdapter].map((adapter) => [adapter.type, adapter]));

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? hermesAdapter;
}
