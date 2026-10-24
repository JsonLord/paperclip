const SECRET_PAYLOAD_KEY_RE =
  /(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)/i;
const JWT_VALUE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/;
export const REDACTED_EVENT_VALUE = "***REDACTED***";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (isSecretRefBinding(value)) return value;
  if (isPlainBinding(value)) return { type: "plain", value: sanitizeValue(value.value) };
  if (!isPlainObject(value)) return value;
  return sanitizeRecord(value);
}

function isSecretRefBinding(value: unknown): value is { type: "secret_ref"; secretId: string; version?: unknown } {
  if (!isPlainObject(value)) return false;
  return value.type === "secret_ref" && typeof value.secretId === "string";
}

function isPlainBinding(value: unknown): value is { type: "plain"; value: unknown } {
  if (!isPlainObject(value)) return false;
  return value.type === "plain" && "value" in value;
}

export function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SECRET_PAYLOAD_KEY_RE.test(key)) {
      if (isSecretRefBinding(value)) {
        redacted[key] = sanitizeValue(value);
        continue;
      }
      if (isPlainBinding(value)) {
        redacted[key] = { type: "plain", value: REDACTED_EVENT_VALUE };
        continue;
      }
      redacted[key] = REDACTED_EVENT_VALUE;
      continue;
    }
    if (typeof value === "string" && JWT_VALUE_RE.test(value)) {
      redacted[key] = REDACTED_EVENT_VALUE;
      continue;
    }
    redacted[key] = sanitizeValue(value);
  }
  return redacted;
}

export function redactEventPayload(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  if (!isPlainObject(payload)) return payload;
  return sanitizeRecord(payload);
}

/**
 * Log-safety variants of the event redactors. Logged values can be anything a
 * client sent (JWTs in unexpected keys, Buffers, class instances, pathologically
 * deep payloads), so this entry point additionally:
 * - redacts JWT-shaped string values regardless of key name,
 * - never returns exotic objects raw (Buffer, Error, class instances) to logs,
 * - keeps recursion bounded for hostile payloads.
 */
const LOG_REDACTION_MAX_DEPTH = 12;
const AUTH_ROUTE_PATH_RE = /^\/api\/auth(\/|$|\?)/;

function sanitizeLogValueInner(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (depth > LOG_REDACTION_MAX_DEPTH) return REDACTED_EVENT_VALUE;
  if (typeof value === "string") return JWT_VALUE_RE.test(value) ? REDACTED_EVENT_VALUE : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValueInner(item, depth + 1));
  if (isSecretRefBinding(value)) return value; // refs carry no secret material
  if (!isPlainObject(value)) return REDACTED_EVENT_VALUE;
  const redacted: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_PAYLOAD_KEY_RE.test(key) && !isSecretRefBinding(inner)) {
      redacted[key] = REDACTED_EVENT_VALUE;
      continue;
    }
    redacted[key] = sanitizeLogValueInner(inner, depth + 1);
  }
  return redacted;
}

export function sanitizeLogValue(value: unknown): unknown {
  return sanitizeLogValueInner(value, 0);
}

/**
 * Request-body policy for HTTP logging and error context. Anything posted to
 * /api/auth/* is credential-bearing by definition, so its body is never logged
 * at all; every other body goes through field-level redaction. This keeps the
 * fix independent of any single field name.
 */
export function sanitizeRequestBody(pathOrUrl: string | undefined, body: unknown): unknown {
  if (typeof pathOrUrl === "string" && AUTH_ROUTE_PATH_RE.test(pathOrUrl)) {
    return REDACTED_EVENT_VALUE;
  }
  return sanitizeLogValue(body);
}
