import type { JulesDispatchDecision } from "@paperclipai/shared";
export interface JulesBrokerProfile { id: string; enabled: boolean; status: string; capabilities: string[]; sessionStartLimit: number; reserveSessionStarts: number; startsInWindow: number; concurrentSessionLimit: number; activeSessions: number; sourceAccessible: boolean }
export interface JulesDispatchRequest { requiredCapabilities: string[]; writeConflict?: boolean; urgent?: boolean }
export function selectJulesProfile(profiles: JulesBrokerProfile[], request: JulesDispatchRequest): JulesDispatchDecision {
  if (request.writeConflict) return { kind: "blocked_conflict", reason: "An active session has an overlapping repository write scope" };
  const active = profiles.filter((p) => p.enabled && p.status === "active");
  const capable = active.filter((p) => request.requiredCapabilities.every((cap) => p.capabilities.includes(cap)));
  if (!capable.length) return { kind: "blocked_missing_capability", reason: "No active profile provides every required capability" };
  const sourced = capable.filter((p) => p.sourceAccessible);
  if (!sourced.length) return { kind: "blocked_no_source_access", reason: "Capable profiles cannot access the company Jules source" };
  const concurrent = sourced.filter((p) => p.activeSessions < p.concurrentSessionLimit);
  if (!concurrent.length) return { kind: "queue", reason: "All eligible profiles are at their concurrency limit" };
  const quota = concurrent.filter((p) => p.startsInWindow < p.sessionStartLimit - (request.urgent ? 0 : p.reserveSessionStarts));
  if (!quota.length) return { kind: "blocked_quota", reason: "Rolling-window capacity or reserve policy prevents dispatch" };
  quota.sort((a, b) => (a.startsInWindow / a.sessionStartLimit) - (b.startsInWindow / b.sessionStartLimit) || a.activeSessions - b.activeSessions || a.id.localeCompare(b.id));
  return { kind: "dispatch", profileId: quota[0].id };
}
