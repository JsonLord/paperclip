import type { ServerAdapterModule } from "./types.js";
import {
  execute as hermesExecute,
  testEnvironment as hermesTestEnvironment,
  sessionCodec as hermesSessionCodec,
} from "hermes-paperclip-adapter/server";
import {
  agentConfigurationDoc as hermesAgentConfigurationDoc,
  models as hermesModels,
} from "hermes-paperclip-adapter";
import {
  execute as julesExecute,
  testEnvironment as julesTestEnvironment,
  sessionCodec as julesSessionCodec,
} from "@paperclipai/adapter-jules/server";
import {
  agentConfigurationDoc as julesAgentConfigurationDoc,
  models as julesModels,
} from "@paperclipai/adapter-jules";

const adapters: ServerAdapterModule[] = [
  {
    type: "hermes_local",
    execute: hermesExecute,
    testEnvironment: hermesTestEnvironment,
    sessionCodec: hermesSessionCodec,
    models: hermesModels,
    supportsLocalAgentJwt: true,
    agentConfigurationDoc: hermesAgentConfigurationDoc,
  },
  {
    type: "jules",
    execute: julesExecute,
    testEnvironment: julesTestEnvironment,
    sessionCodec: julesSessionCodec,
    models: julesModels,
    supportsLocalAgentJwt: false,
    agentConfigurationDoc: julesAgentConfigurationDoc,
  },
];

const adaptersByType = new Map(adapters.map((adapter) => [adapter.type, adapter]));

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = findServerAdapter(type);
  if (!adapter) throw new Error(`Unsupported adapter type: ${type}. This FounderOS build supports only hermes_local and jules.`);
  return adapter;
}

export async function listAdapterModels(type: string): Promise<{ id: string; label: string }[]> {
  const adapter = findServerAdapter(type);
  if (!adapter) return [];
  if (adapter.listModels) {
    const discovered = await adapter.listModels();
    if (discovered.length > 0) return discovered;
  }
  return adapter.models ?? [];
}

export function listServerAdapters(): ServerAdapterModule[] {
  return [...adapters];
}

export function findServerAdapter(type: string): ServerAdapterModule | null {
  return adaptersByType.get(type) ?? null;
}
