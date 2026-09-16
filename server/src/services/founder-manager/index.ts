import { z } from "zod";
import type { ResultJudgeInput, ResultJudgment, FailureClass } from "./types.js";
export * from "./types.js";
const schema = z.object({ verdict: z.enum(["ACCEPT", "REVISE_SAME_SESSION", "RETRY_NEW_SESSION", "WAIT", "ESCALATE", "FAIL_OUTCOME"]), confidence: z.number().min(0).max(1), reason: z.string().min(1), passedCriteria: z.array(z.string()), failedCriteria: z.array(z.string()), revisionInstructions: z.array(z.string()), requiresHuman: z.boolean(), recommendedWaitCondition: z.string().min(1).optional(), recommendedNextAction: z.string().min(1).optional() }).strict();
export function parseResultJudgment(value: unknown): ResultJudgment { const parsed = typeof value === "string" ? JSON.parse(value) : value; return schema.parse(parsed); }
export interface FounderManagerProvider { provider?: string; model?: string; resultJudge(input: ResultJudgeInput): Promise<unknown>; failureDiagnosis?(input: ResultJudgeInput): Promise<{ classification: FailureClass; reason: string }>; retryDecision?(input: ResultJudgeInput & { classification: FailureClass }): Promise<unknown> }
export function founderManagerService(provider: FounderManagerProvider) {
  async function resultJudge(input: ResultJudgeInput) {
    const judgment = parseResultJudgment(await provider.resultJudge(input));
    if (input.validation.hardFailure && judgment.verdict === "ACCEPT") throw new Error("Hermes cannot override a deterministic hard failure");
    return judgment;
  }
  async function failureDiagnosis(input: ResultJudgeInput): Promise<{ classification: FailureClass; reason: string }> {
    const codes = input.validation.failed.map((f) => f.code);
    const deterministic: Array<[string, FailureClass]> = [["secret_leak", "SECRET_LEAK"], ["write_scope", "WRITE_SCOPE_VIOLATION"], ["ci_check", "CI_FAILURE"], ["ci_pending", "EXTERNAL_DEPENDENCY"], ["evidence_exists", "MISSING_EVIDENCE"]];
    const match = deterministic.find(([code]) => codes.includes(code));
    if (match) return { classification: match[1], reason: `Deterministic validation reported ${match[0]}` };
    return provider.failureDiagnosis ? provider.failureDiagnosis(input) : { classification: "UNKNOWN", reason: "No deterministic failure classification matched" };
  }
  async function retryDecision(input: ResultJudgeInput & { classification: FailureClass }) { if (!provider.retryDecision) throw new Error("Founder manager retry_decision is not configured"); return parseResultJudgment(await provider.retryDecision(input)); }
  return { resultJudge, failureDiagnosis, retryDecision, provider: provider.provider, model: provider.model };
}

export function createOpenAiCompatibleFounderManagerProvider(config: { baseUrl?: string; apiKey?: string; model?: string } = {}): FounderManagerProvider {
  const baseUrl = config.baseUrl ?? process.env.FOUNDER_MANAGER_BASE_URL; const apiKey = config.apiKey ?? process.env.FOUNDER_MANAGER_API_KEY; const model = config.model ?? process.env.FOUNDER_MANAGER_MODEL ?? "alias-fast";
  if (!baseUrl || !apiKey) throw new Error("Founder manager OpenAI-compatible provider is not configured");
  const endpoint = baseUrl.replace(/\/$/, ""); const credential = apiKey;
  async function invoke(operation: string, input: unknown) { const response = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${credential}` }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: `You are the FounderOS Hermes manager performing ${operation}. Return only the required structured JSON verdict. Never override deterministic hard failures.` }, { role: "user", content: JSON.stringify(input) }] }) }); if (!response.ok) throw new Error(`Founder manager request failed (${response.status})`); const body = await response.json() as any; const content = body.choices?.[0]?.message?.content; if (typeof content !== "string") throw new Error("Founder manager returned no structured content"); return content; }
  return { provider: "openai-compatible", model, resultJudge: (input) => invoke("result_judge", input), failureDiagnosis: async (input) => { const raw = await invoke("failure_diagnosis", input); return z.object({ classification: z.enum(["INFRASTRUCTURE_TRANSIENT","PROVIDER_QUOTA","AUTH","SOURCE_ACCESS","CAPABILITY_MISSING","REMOTE_SESSION_FAILURE","CI_FAILURE","WRITE_SCOPE_VIOLATION","SECRET_LEAK","QUALITY_FAILURE","MISSING_EVIDENCE","INVALID_GOAL_CONTRACT","EXTERNAL_DEPENDENCY","BUSINESS_CONTRADICTION","UNKNOWN"]), reason: z.string().min(1) }).strict().parse(JSON.parse(raw)); }, retryDecision: (input) => invoke("retry_decision", input) };
}
