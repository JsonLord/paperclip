import pc from "picocolors";

export function printHermesStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;
  if (!debug) return void console.log(line);
  if (line.startsWith("[hermes]")) return void console.log(pc.blue(line));
  if (line.startsWith("┊")) return void console.log(pc.cyan(line));
  if (line.includes("💭") || line.startsWith("<thinking>")) return void console.log(pc.dim(line));
  if (/^(Error:|ERROR:|Traceback)/.test(line)) return void console.log(pc.red(line));
  if (/session/i.test(line) && /id|saved|resumed/i.test(line)) return void console.log(pc.green(line));
  console.log(pc.gray(line));
}
