import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { JulesSessionStatus } from "@paperclipai/shared";

export const JULES_RUN_OPERATIONS = [
  "read_run_context", "report_progress", "report_blocker", "report_artifact",
  "propose_workstream", "request_approval", "submit_completion_candidate",
] as const;
export type JulesRunOperation = typeof JULES_RUN_OPERATIONS[number];

export interface JulesRunCapabilityClaims {
  companyId: string; paperclipRunId: string; julesSessionId: string; agentId: string;
  goalId: string | null; projectId: string | null; issueId: string | null; outcomeId: string | null;
  allowedOperations: JulesRunOperation[]; issuedAt: number; expiresAt: number; jti: string; version: number;
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = (value: string) => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

function signingSecret(): string {
  const secret = process.env.PAPERCLIP_JULES_CAPABILITY_SECRET ?? process.env.PAPERCLIP_AGENT_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("PAPERCLIP_JULES_CAPABILITY_SECRET or PAPERCLIP_AGENT_JWT_SECRET must contain at least 32 characters");
  return secret;
}

export function issueJulesRunCapability(input: Omit<JulesRunCapabilityClaims, "issuedAt" | "expiresAt" | "jti">, ttlSec = 3600, now = Date.now()): string {
  const claims: JulesRunCapabilityClaims = { ...input, issuedAt: Math.floor(now / 1000), expiresAt: Math.floor(now / 1000) + ttlSec, jti: randomUUID() };
  const header = encode({ alg: "HS256", typ: "JWT", kid: `jules-run-v${input.version}` });
  const payload = encode(claims);
  const signature = createHmac("sha256", signingSecret()).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyJulesRunCapability(token: string, operation: JulesRunOperation, now = Date.now()): JulesRunCapabilityClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Jules run capability");
  const expected = createHmac("sha256", signingSecret()).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid Jules run capability signature");
  const claims = decode(parts[1]) as JulesRunCapabilityClaims;
  if (!claims || typeof claims !== "object" || !Array.isArray(claims.allowedOperations)) throw new Error("Invalid Jules run capability claims");
  if (claims.expiresAt <= Math.floor(now / 1000)) throw new Error("Jules run capability expired");
  if (!claims.allowedOperations.includes(operation)) throw new Error(`Jules run capability does not allow ${operation}`);
  return claims;
}

export function isJulesCapabilityWritable(status: JulesSessionStatus): boolean {
  return !["ACCEPTED", "ESCALATED", "ORPHANED", "FAILED"].includes(status);
}
