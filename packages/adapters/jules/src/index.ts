export const type = "jules";
export const label = "Google Jules (remote)";
export const models: { id: string; label: string }[] = [];
export const agentConfigurationDoc = `# Jules adapter configuration

Use when substantial execution must run remotely in a company GitHub repository through Google Jules.
Do not use for local work or managerial judgment; use Hermes for FounderOS management.

Required fields:
- env.JULES_API_KEY: Jules API key bound through a Paperclip company secret
- source: Jules source identifier for the bound GitHub repository
- repository: owner/repository
- outcomeTemplate: one of the built-in FounderOS validation templates, or sessionSpec/promptTemplate

Optional fields: apiBaseUrl, startingBranch (default main), pollIntervalSec, maxWaitSec, autoApprovePlan.
The adapter calls the REST API directly and never invokes a local Jules executable. A Jules COMPLETED session is returned only as a completion candidate and is never self-accepted or auto-merged.
`;
export { JULES_PROMPT_VERSION, JULES_OUTCOME_TEMPLATES, createJulesSessionSpec, renderJulesPrompt } from "./prompts.js";
export type { JulesSessionSpec, JulesOutcomeTemplate, ExternalActionPolicy, LinearMode } from "./prompts.js";
