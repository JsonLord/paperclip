import { parseObject } from "../adapters/utils.js";

/** The variable a locally-run agent reads its Paperclip bearer token from. */
export const AGENT_API_KEY_ENV = "PAPERCLIP_API_KEY";

/**
 * Carry a run's minted agent JWT into the adapter config as `PAPERCLIP_API_KEY`.
 *
 * A local-JWT adapter is handed the token as `ctx.authToken` and is meant to put it in
 * the child process environment itself. `hermes-paperclip-adapter` never reads that
 * field — it takes its settings from `ctx.agent.adapterConfig` — so the token was
 * minted and dropped, and every Paperclip call the agent made came back unauthorized.
 *
 * An explicitly configured key wins: an operator who pinned a long-lived agent key
 * keeps it, and re-running is a no-op.
 */
export function withAgentApiKey(
  config: Record<string, unknown>,
  authToken: string | null | undefined,
): { config: Record<string, unknown>; injected: boolean } {
  if (!authToken) return { config, injected: false };
  const env = parseObject(config.env);
  const configured = env[AGENT_API_KEY_ENV];
  if (typeof configured === "string" && configured.trim().length > 0) return { config, injected: false };
  return { config: { ...config, env: { ...env, [AGENT_API_KEY_ENV]: authToken } }, injected: true };
}
