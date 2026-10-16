import type { DecisionRequest } from "@paperclipai/shared";
const FOUNDER_CATEGORIES = new Set([
  "vision",
  "icp",
  "pivot",
  "pause",
  "budget",
  "market",
  "constraint",
  "positioning",
  "external_action",
]);
export function decisionAuthority(
  request: DecisionRequest,
  now = new Date(),
  nextBriefing = new Date(now.getTime() + 86_400_000),
) {
  const founder =
    request.requiredAuthority === "founder" ||
    FOUNDER_CATEGORIES.has(request.category) ||
    !request.reversible ||
    request.conflictsWithFounder ||
    request.evidenceAbsent ||
    (request.confidence < 0.6 && request.impact === "high");
  const urgent =
    founder &&
    (Date.parse(request.deadline) < nextBriefing.getTime() ||
      request.securityRisk ||
      request.budgetBreach ||
      !request.reversible ||
      request.criticallyBlocked);
  return {
    authority: founder ? ("founder" as const) : ("ceo" as const),
    queue: founder ? (urgent ? "urgent" : "briefing") : "ceo",
  };
}
