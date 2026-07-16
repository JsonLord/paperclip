import { logger } from "../../middleware/logger.js";

const OPENVIKING_URL = process.env.OPENVIKING_URL ?? "";
const OPENVIKING_API_KEY = process.env.OPENVIKING_API_KEY ?? "";

function enabled(): boolean {
  return OPENVIKING_URL.length > 0 && OPENVIKING_API_KEY.length > 0;
}

async function ovFetch(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  if (!enabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${OPENVIKING_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENVIKING_API_KEY}`,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ path, status: res.status }, "[openviking] request failed");
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ path, err }, "[openviking] request errored");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort: ensures the session exists, does not throw on failure. */
export async function ensureSession(sessionId: string): Promise<void> {
  await ovFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}?auto_create=true`, {
    method: "GET",
  });
}

/** Best-effort: appends a message to the durable session record. */
export async function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!content) return;
  await ovFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ role, content }),
  });
}

/** Best-effort: triggers archive + memory extraction. Fire-and-forget. */
export async function commitSession(sessionId: string): Promise<void> {
  await ovFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/commit`, {
    method: "POST",
  });
}

/**
 * Retrieves a compact summary of the durable session record so a NEW chat
 * (fresh remote context id) can be seeded with equivalent context after the
 * previous remote chat hung up / errored.
 */
export async function getSessionSummary(sessionId: string): Promise<string | null> {
  const result = await ovFetch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/context?token_budget=4000`,
    { method: "GET" },
  );
  const payload = result?.result as Record<string, unknown> | undefined;
  const overview = payload?.latest_archive_overview;
  if (typeof overview === "string" && overview.trim().length > 0) return overview.trim();

  const messages = Array.isArray(payload?.messages) ? (payload!.messages as Array<Record<string, unknown>>) : [];
  if (messages.length === 0) return null;
  const lines = messages.slice(-6).map((msg) => {
    const parts = Array.isArray(msg.parts) ? (msg.parts as Array<Record<string, unknown>>) : [];
    const text = parts.find((p) => p.type === "text")?.text;
    return `${msg.role}: ${typeof text === "string" ? text : ""}`;
  });
  return lines.join("\n").trim() || null;
}

export const openVikingEnabled = enabled;
