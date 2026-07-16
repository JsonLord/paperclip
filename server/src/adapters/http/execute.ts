import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, asNumber, parseObject, renderTemplate } from "../utils.js";
import { ensureSession, addMessage, commitSession, getSessionSummary, openVikingEnabled } from "./openviking-client.js";

const MAX_CHAT_ATTEMPTS = 3; // 1 initial context + up to 2 fresh-chat fallbacks
// Patient backoff for transient connection errors (e.g. flaky egress on the
// remote side) BEFORE giving up on the current chat context and starting a
// fresh one. Same-context retries preserve conversation continuity, so they
// are always preferred over a fresh chat when the failure looks transient.
const SAME_CONTEXT_RETRY_DELAYS_MS = [3000, 8000, 15000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function interpolateDeep(value: unknown, data: Record<string, unknown>): unknown {
  if (typeof value === "string") return renderTemplate(value, data);
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, data));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolateDeep(v, data)]),
    );
  }
  return value;
}

function sessionKeyFor(ctx: AdapterExecutionContext): string {
  const taskKey = ctx.runtime.taskKey;
  return `paperclip-${ctx.agent.id}-${taskKey ?? "default"}`;
}

async function callRemote(
  url: string,
  method: string,
  headers: Record<string, string>,
  timeoutMs: number,
  body: Record<string, unknown>,
): Promise<{ status: number; ok: boolean; text: string; parsed: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      ...(timer ? { signal: controller.signal } : {}),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, ok: res.ok, text, parsed };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, runId, agent, context, runtime } = ctx;
  const url = asString(config.url, "");
  if (!url) throw new Error("HTTP adapter missing url");

  const method = asString(config.method, "POST");
  const timeoutMs = asNumber(config.timeoutMs, 0);
  const headers = parseObject(config.headers) as Record<string, string>;
  const payloadTemplate = parseObject(config.payloadTemplate);

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedPayload = interpolateDeep(payloadTemplate, templateData) as Record<string, unknown>;
  const outgoingMessage = asString(renderedPayload.message, "");

  const sessionKey = sessionKeyFor(ctx);
  const ovOn = openVikingEnabled();
  if (ovOn) await ensureSession(sessionKey);

  const existingRemoteContext = asString(parseObject(runtime.sessionParams).openOperatorContext, "") || undefined;

  let remoteContext = existingRemoteContext;
  let chatAttempt = 0;
  let lastError: Error | null = null;
  let response: Awaited<ReturnType<typeof callRemote>> | null = null;
  let startedFreshChat = false;
  let retriedSameContext = false;

  while (chatAttempt < MAX_CHAT_ATTEMPTS && !response) {
    chatAttempt += 1;
    let messageForAttempt = outgoingMessage;

    // Hung-up fallback: the previous chat context was exhausted (all patient
    // retries on it failed). Start a brand-new remote chat (drop the old
    // context id) but seed it with a durable summary so it's not starting
    // blind.
    if (chatAttempt > 1) {
      startedFreshChat = true;
      remoteContext = undefined;
      const summary = ovOn ? await getSessionSummary(sessionKey) : null;
      if (summary) {
        messageForAttempt = `[Continuing after a dropped connection. Prior context summary:]\n${summary}\n\n[New message:]\n${outgoingMessage}`;
      }
    }

    const body: Record<string, unknown> = {
      ...renderedPayload,
      message: messageForAttempt,
      agentId: agent.id,
      runId,
      ...(remoteContext ? { context: remoteContext } : {}),
    };

    // Patient retry loop: keep hitting the SAME chat context/body a few
    // times with backoff before concluding it's actually broken. Most
    // failures we've observed are transient connection errors, not a truly
    // dead context, so retrying in place beats burning a fresh chat.
    for (let retryIdx = 0; retryIdx <= SAME_CONTEXT_RETRY_DELAYS_MS.length; retryIdx++) {
      if (retryIdx > 0) retriedSameContext = true;
      try {
        response = await callRemote(url, method, headers, timeoutMs, body);
        if (response.ok) break;
        lastError = new Error(`HTTP invoke failed with status ${response.status}: ${response.text.slice(0, 500)}`);
        response = null;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        response = null;
      }
      if (retryIdx < SAME_CONTEXT_RETRY_DELAYS_MS.length) {
        await sleep(SAME_CONTEXT_RETRY_DELAYS_MS[retryIdx]);
      }
    }
  }

  if (!response) {
    throw lastError ?? new Error("HTTP adapter failed after retries");
  }

  const returnedContext = asString(response.parsed?.context, "") || remoteContext || null;
  const replyText = asString(response.parsed?.message, "") || response.text;

  if (ovOn) {
    void addMessage(sessionKey, "user", outgoingMessage)
      .then(() => addMessage(sessionKey, "assistant", replyText))
      .then(() => commitSession(sessionKey))
      .catch(() => {});
  }

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    summary: `HTTP ${method} ${url}${retriedSameContext ? " (retried same context)" : ""}${startedFreshChat ? " (new chat after hang-up)" : ""}`,
    sessionParams: returnedContext ? { openOperatorContext: returnedContext } : null,
    sessionDisplayId: returnedContext,
  };
}
