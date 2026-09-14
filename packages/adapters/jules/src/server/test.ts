import type { AdapterEnvironmentCheck, AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from "@paperclipai/adapter-utils";
import { testGitHubConnection } from "./github.js";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const env = ctx.config.env && typeof ctx.config.env === "object" ? ctx.config.env as Record<string, unknown> : {};
  const hasApiKey = Boolean(env.JULES_API_KEY || ctx.config.apiKey);
  const repository = typeof ctx.config.repository === "string" ? ctx.config.repository.trim() : "";
  const source = typeof ctx.config.source === "string" ? ctx.config.source.trim() : "";
  const checks: AdapterEnvironmentCheck[] = [
    { code: "jules_api_key", level: hasApiKey ? "info" : "error", message: hasApiKey ? "Jules API credential is configured" : "Jules API credential is missing", hint: hasApiKey ? undefined : "Bind JULES_API_KEY through a Paperclip company secret." },
    { code: "jules_source", level: source ? "info" : "error", message: source ? "Jules source is configured" : "Jules source is required" },
    { code: "jules_remote_only", level: "info", message: "Jules uses REST APIs and does not require a local executable or cwd" },
  ];
  if (repository) {
    const github = await testGitHubConnection(repository, {
      token: typeof env.GITHUB_TOKEN === "string" ? env.GITHUB_TOKEN : undefined,
      apiBaseUrl: typeof ctx.config.githubApiBaseUrl === "string" ? ctx.config.githubApiBaseUrl : undefined,
    });
    checks.push({ code: "jules_github_connection", level: github.ok ? "info" : "error", message: github.ok ? `GitHub repository is reachable${github.defaultBranch ? ` (default: ${github.defaultBranch})` : ""}` : github.error ?? "GitHub connection failed", detail: repository });
  } else {
    checks.push({ code: "jules_github_connection", level: "error", message: "GitHub repository is required" });
  }
  return { adapterType: "jules", status: checks.some((check) => check.level === "error") ? "fail" : checks.some((check) => check.level === "warn") ? "warn" : "pass", checks, testedAt: new Date().toISOString() };
}
