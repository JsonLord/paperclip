import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";
export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { JulesApiClient } from "./api.js";
export const sessionCodec: AdapterSessionCodec = { deserialize: (raw) => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null, serialize: (params) => params, getDisplayId: (params) => typeof params?.julesSessionId === "string" ? params.julesSessionId : null };
export { testGitHubConnection } from "./github.js";
