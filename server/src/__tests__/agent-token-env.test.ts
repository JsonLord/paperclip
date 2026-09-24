import { describe, expect, it } from "vitest";
import { AGENT_API_KEY_ENV, withAgentApiKey } from "../services/agent-token-env.js";

// The Founder Manager the FounderOS bootstrap creates, verbatim: no env at all.
const bootstrapConfig = { model: "alias-fast", timeoutSec: 900 };

describe("agent Paperclip API key injection", () => {
  it("gives a freshly bootstrapped agent the run's token", () => {
    const result = withAgentApiKey(bootstrapConfig, "jwt-token");
    expect(result.injected).toBe(true);
    expect(result.config.env).toEqual({ [AGENT_API_KEY_ENV]: "jwt-token" });
    // Every other setting survives untouched.
    expect(result.config).toMatchObject(bootstrapConfig);
  });

  it("keeps the rest of a configured environment", () => {
    const result = withAgentApiKey({ ...bootstrapConfig, env: { HTTP_PROXY: "http://proxy:3128" } }, "jwt-token");
    expect(result.config.env).toEqual({ HTTP_PROXY: "http://proxy:3128", [AGENT_API_KEY_ENV]: "jwt-token" });
  });

  it("never overwrites a key an operator pinned", () => {
    const pinned = { ...bootstrapConfig, env: { [AGENT_API_KEY_ENV]: "pcp_long_lived" } };
    const result = withAgentApiKey(pinned, "jwt-token");
    expect(result.injected).toBe(false);
    expect(result.config).toBe(pinned);
    expect(result.config.env).toEqual({ [AGENT_API_KEY_ENV]: "pcp_long_lived" });
  });

  it("treats a blank configured key as absent", () => {
    const result = withAgentApiKey({ env: { [AGENT_API_KEY_ENV]: "   " } }, "jwt-token");
    expect(result.injected).toBe(true);
    expect(result.config.env).toEqual({ [AGENT_API_KEY_ENV]: "jwt-token" });
  });

  it("changes nothing when no token was minted", () => {
    // supportsLocalAgentJwt is false for jules, and minting fails when the secret is unset.
    for (const token of [null, undefined, ""]) {
      const result = withAgentApiKey(bootstrapConfig, token);
      expect(result.injected).toBe(false);
      expect(result.config).toBe(bootstrapConfig);
    }
  });

  it("is idempotent, so a re-dispatch does not stack tokens", () => {
    const once = withAgentApiKey(bootstrapConfig, "jwt-token").config;
    const twice = withAgentApiKey(once, "a-different-token");
    expect(twice.injected).toBe(false);
    expect(twice.config.env).toEqual({ [AGENT_API_KEY_ENV]: "jwt-token" });
  });

  it("tolerates a non-object env rather than throwing mid-dispatch", () => {
    const result = withAgentApiKey({ env: "not-an-object" }, "jwt-token");
    expect(result.config.env).toEqual({ [AGENT_API_KEY_ENV]: "jwt-token" });
  });
});
