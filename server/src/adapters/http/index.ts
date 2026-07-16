import type { AdapterSessionCodec, ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const contextId = (raw as Record<string, unknown>).openOperatorContext;
    return typeof contextId === "string" && contextId.length > 0 ? { openOperatorContext: contextId } : null;
  },
  serialize(params) {
    if (!params || typeof params.openOperatorContext !== "string") return null;
    return { openOperatorContext: params.openOperatorContext };
  },
  getDisplayId(params) {
    const contextId = params?.openOperatorContext;
    return typeof contextId === "string" && contextId.length > 0 ? contextId : null;
  },
};

export const httpAdapter: ServerAdapterModule = {
  type: "http",
  execute,
  testEnvironment,
  models: [],
  sessionCodec,
  agentConfigurationDoc: `# http agent configuration

Adapter: http

Core fields:
- url (string, required): endpoint to invoke
- method (string, optional): HTTP method, default POST
- headers (object, optional): request headers
- payloadTemplate (object, optional): JSON payload template. Values are
  interpolated with {{dotted.path}} placeholders resolved against
  { agentId, companyId, runId, company, agent, run, context }
  (e.g. {{agent.name}}, {{context.wakeReason}}).
- timeoutMs (number, optional): request timeout in milliseconds

Session behavior:
- Each task/issue gets its own remote chat context, persisted per
  (company, agent, task). The remote endpoint's JSON response is expected to
  echo back a "context" field (string) to continue that same chat on the
  next call; paperclip stores and resends it automatically.
- If a call times out, errors, or returns a non-2xx status, paperclip first
  retries patiently on the SAME chat context (3 retries with 3s/8s/15s
  backoff) since most failures observed in practice are transient connection
  errors on the remote side, not a genuinely broken context. Only after
  those retries are exhausted does paperclip fall back to starting a NEW
  remote chat (dropping the old context id), up to twice. When
  OPENVIKING_URL/OPENVIKING_API_KEY are configured, the new chat is seeded
  with a durable summary of the prior conversation so context isn't lost
  across the hand-off.
`,
};
