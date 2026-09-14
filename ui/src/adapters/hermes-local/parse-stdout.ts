import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseHermesStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const text = line.trim();
  if (!text) return [];
  if (text.startsWith("[hermes]")) return [{ kind: "system", ts, text }];
  if (text.startsWith("┊")) return [{ kind: "stdout", ts, text: text.slice(1).trim() }];
  if (text.includes("💭") || text.startsWith("<thinking>") || text.startsWith("Thinking:")) {
    return [{ kind: "thinking", ts, text: text.replace(/^💭\s*/, "") }];
  }
  if (/^(Error:|ERROR:|Traceback)/.test(text)) return [{ kind: "stderr", ts, text }];
  return [{ kind: "assistant", ts, text }];
}
