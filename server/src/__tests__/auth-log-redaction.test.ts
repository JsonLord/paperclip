import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
import { errorHandler } from "../middleware/error-handler.js";
import { REDACTED_EVENT_VALUE, sanitizeLogValue, sanitizeRequestBody } from "../redaction.js";

// Synthetic credentials only. Never place real or captured secrets in fixtures.
const SYNTH_PASSWORD = "synthetic-pw-9d2f-not-real";
const SYNTH_JWT = "eyJhbGciOi.eyJzdWIiOiJzeW50aGV0aWMifQ.sigpart000";

describe("auth log redaction (GATE05-R WP4 regression)", () => {
  it("never logs any credential-bearing /api/auth/* body, e.g. 401 sign-in", () => {
    // October 24 incident: failed sign-in logged the raw request body with password.
    const body = { email: "operator@example.invalid", password: SYNTH_PASSWORD };
    const logged = sanitizeRequestBody("/api/auth/sign-in/email", body);
    expect(logged).toBe(REDACTED_EVENT_VALUE);
    expect(JSON.stringify(logged)).not.toContain(SYNTH_PASSWORD);
  });

  it("redacts nested and top-level credential fields on ordinary routes", () => {
    const logged = sanitizeRequestBody("/api/companies/x/agents", {
      name: "safe",
      password: SYNTH_PASSWORD,
      nested: { authorization: "Bearer synthetic", apiKey: "sk-synthetic", keep: 1 },
      deep: { credentials: { token: "synthetic" } },
    }) as Record<string, unknown>;
    expect(logged.name).toBe("safe");
    expect(logged.password).toBe(REDACTED_EVENT_VALUE);
    expect(logged.nested).toEqual({
      authorization: REDACTED_EVENT_VALUE,
      apiKey: REDACTED_EVENT_VALUE,
      keep: 1,
    });
    expect(JSON.stringify(logged)).not.toContain(SYNTH_PASSWORD);
  });

  it("redacts JWT-shaped values regardless of key name", () => {
    const logged = sanitizeLogValue({ data: SYNTH_JWT, other: SYNTH_JWT }) as Record<string, unknown>;
    expect(logged.data).toBe(REDACTED_EVENT_VALUE);
    expect(JSON.stringify(logged)).not.toContain(SYNTH_JWT);
  });

  it("never passes exotic objects or pathologically deep payloads to logs raw", () => {
    expect(sanitizeLogValue(Buffer.from("synthetic"))).toBe(REDACTED_EVENT_VALUE);
    expect(sanitizeLogValue(new Error("boom"))).toBe(REDACTED_EVENT_VALUE);
    let deep: Record<string, unknown> = { password: SYNTH_PASSWORD };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(JSON.stringify(sanitizeLogValue(deep))).not.toContain(SYNTH_PASSWORD);
  });

  it("sanitizes error-handler context bodies and error payloads", () => {
    const req = {
      method: "POST",
      originalUrl: "/api/auth/sign-in/email",
      body: { email: "operator@example.invalid", password: SYNTH_PASSWORD },
      params: {},
      query: {},
    } as unknown as Request;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
    (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
    errorHandler(new HttpError(500, "db exploded", { password: SYNTH_PASSWORD }), req, res, vi.fn() as unknown as NextFunction);
    const ctx = (res as any).__errorContext;
    expect(ctx.reqBody).toBe(REDACTED_EVENT_VALUE);
    expect(JSON.stringify(ctx)).not.toContain(SYNTH_PASSWORD);
    expect(ctx.error.message).toBe("db exploded");
  });

  it("keeps middleware wiring redaction-safe (source guard)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const logger = readFileSync(path.join(here, "../middleware/logger.ts"), "utf8");
    const handler = readFileSync(path.join(here, "../middleware/error-handler.ts"), "utf8");
    expect(logger).toContain("sanitizeRequestBody");
    expect(logger).toContain("sanitizeLogValue");
    expect(logger).not.toMatch(/props\.reqBody\s*=\s*body\s*;/);
    expect(handler).toContain("sanitizeRequestBody");
    expect(handler).not.toMatch(/reqBody:\s*req\.body\s*,/);
  });
});
