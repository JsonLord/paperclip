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

/** The variable a locally-run agent reads a GitHub token from, for repo writes. */
export const AGENT_GITHUB_TOKEN_ENV = "GITHUB_TOKEN";

/**
 * Carry a GitHub token into a local agent's shell so it can write to a company
 * repository through the GitHub REST API.
 *
 * A remote Jules worker already operates inside the repository; a local Hermes agent
 * does not, and reported three walls when asked to write: no token in its environment,
 * the terminal scanner refusing `git clone`, and the private repo unreadable
 * unauthenticated. The token clears the first and third, and the agent writes with the
 * REST API through curl — which it can already do, since that is how it reaches the
 * Paperclip API — rather than cloning. The value comes from the deployment at runtime,
 * never from the prompt or the database, so it is not persisted and not shown to the model.
 *
 * The caller resolves which token: a deployment-scoped PAPERCLIP_AGENT_GITHUB_TOKEN is
 * preferred so the grant can be narrowed to the company repositories, falling back to
 * the deployment's GITHUB_TOKEN. An explicitly configured value wins; re-running is a no-op.
 */
export function withAgentGithubToken(
  config: Record<string, unknown>,
  token: string | null | undefined,
): { config: Record<string, unknown>; injected: boolean } {
  if (!token || !token.trim()) return { config, injected: false };
  const env = parseObject(config.env);
  const configured = env[AGENT_GITHUB_TOKEN_ENV];
  if (typeof configured === "string" && configured.trim().length > 0) return { config, injected: false };
  return { config: { ...config, env: { ...env, [AGENT_GITHUB_TOKEN_ENV]: token.trim() } }, injected: true };
}
