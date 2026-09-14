import type { CreateConfigValues, TranscriptEntry } from "@paperclipai/adapter-utils";
export const buildJulesConfig = (v: CreateConfigValues): Record<string, unknown> => ({ promptTemplate: v.promptTemplate, source: v.bootstrapPrompt, repository: v.url, startingBranch: "main", maxWaitSec: 30, autoApprovePlan: false });
export const parseJulesStdoutLine = (line: string, ts: string): TranscriptEntry[] => line.trim() ? [{ kind: line.startsWith("[jules]") ? "system" : "stdout", ts, text: line.trim() }] : [];
