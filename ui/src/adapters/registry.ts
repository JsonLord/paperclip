import type { UIAdapterModule } from "./types";
import { hermesLocalUIAdapter } from "./hermes-local";
import { julesUIAdapter } from "./jules";

const adaptersByType = new Map<string, UIAdapterModule>(
  [hermesLocalUIAdapter, julesUIAdapter].map((adapter) => [adapter.type, adapter]),
);

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? hermesLocalUIAdapter;
}
