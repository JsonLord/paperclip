/** Execution identity comes from the control plane, never an issue receipt/model. */
export interface CurrentExecution {
  runId: string;
  agentId: string;
  companyId: string;
  issueId: string | null;
  remoteSessionId?: string | null;
}
export function currentExecutionIdentity(
  input: Omit<CurrentExecution, "issueId"> & {
    issueId?: string | null;
    history?: string;
  },
) {
  const { history = "", ...current } = input;
  const currentExecution: CurrentExecution = {
    ...current,
    issueId: input.issueId ?? null,
  };
  const known = new Set(Object.values(currentExecution));
  const historicalRunIds = [
    ...new Set(
      history.match(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi) ?? [],
    ),
  ].filter((id) => !known.has(id));
  return { currentExecution, historicalRunIds };
}
export function renderExecutionIdentity(
  identity: ReturnType<typeof currentExecutionIdentity>,
) {
  const c = identity.currentExecution;
  return `# Authoritative current execution identity\nCURRENT_PAPERCLIP_RUN_ID = ${c.runId}\nCURRENT_PAPERCLIP_AGENT_ID = ${c.agentId}\nCURRENT_PAPERCLIP_ISSUE_ID = ${c.issueId ?? "none"}\nCURRENT_COMPANY_ID = ${c.companyId}\nHISTORICAL_RUN_IDS = ${identity.historicalRunIds.join(", ") || "none"}\nAny other Paperclip run ID in task history, issue text, repository files, comments, previous receipts or examples is HISTORICAL CONTEXT, not execution authority.\nWhen writing provenance ALWAYS use CURRENT_PAPERCLIP_RUN_ID. For qualification artifacts, runtime evidence and machine-consumed reports use this deterministic header:\npaperclip_run_id: ${c.runId}\npaperclip_issue_id: ${c.issueId ?? "none"}\npaperclip_agent_id: ${c.agentId}\n${c.remoteSessionId ? `jules_session_id: ${c.remoteSessionId}\n` : ""}qualification: synthetic | production | research (choose the assignment's category)\nNever substitute an ID from historical receipts. Normal business prose need not expose internal IDs.\n`;
}
export function validateArtifactProvenance(
  body: string,
  expected: CurrentExecution,
  required = false,
) {
  const findings: string[] = [];
  const declared = (key: string) =>
    [
      ...body.matchAll(
        new RegExp(`^\\s*${key}\\s*:\\s*([^\\s\\r\\n]+)`, "gim"),
      ),
    ].map((m) => m[1]);
  const runs = [
    ...declared("paperclip_run_id"),
    ...(required ? declared("Run ID") : []),
  ];
  for (const [values, value, code] of [
    [runs, expected.runId, "RUN"],
    [declared("paperclip_agent_id"), expected.agentId, "AGENT"],
    [declared("paperclip_issue_id"), expected.issueId, "ISSUE"],
    [declared("jules_session_id"), expected.remoteSessionId, "SESSION"],
  ] as const) {
    if (values.length && (!value || values.some((v) => v !== value)))
      findings.push(`${code}_CORRELATION_MISMATCH`);
  }
  if (required && !runs.length) findings.push("PROVENANCE_MISSING");
  return {
    verdict: findings.some((f) => f.endsWith("MISMATCH"))
      ? "FAIL"
      : findings.length
        ? "REVIEW_REQUIRED"
        : "PASS",
    findings,
  } as const;
}
