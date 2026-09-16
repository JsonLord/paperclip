import type { PullRequestSnapshot, RepositoryFile } from "./types.js";
export interface GitHubValidationSnapshot { pullRequest: PullRequestSnapshot; files: RepositoryFile[] }
function parsePullRequestUrl(value: string) { const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/.exec(value); if (!match) throw new Error("Pull request URL is not a GitHub pull request URL"); return { owner: match[1]!, repo: match[2]!, number: match[3]! }; }
export async function loadGitHubValidationSnapshot(prUrl: string, expectedRepository: string, token = process.env.GITHUB_TOKEN): Promise<GitHubValidationSnapshot> {
  const parsed = parsePullRequestUrl(prUrl); const repository = `${parsed.owner}/${parsed.repo}`;
  if (repository.toLowerCase() !== expectedRepository.toLowerCase()) throw new Error("Pull request targets an unexpected repository");
  const headers: Record<string,string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }; if (token) headers.authorization = `Bearer ${token}`;
  const get = async (url: string) => { const response = await fetch(url, { headers }); if (!response.ok) throw new Error(`GitHub validation request failed (${response.status})`); return response.json(); };
  const pr = await get(`https://api.github.com/repos/${repository}/pulls/${parsed.number}`) as any;
  const changed: any[] = await get(`https://api.github.com/repos/${repository}/pulls/${parsed.number}/files?per_page=100`) as any[];
  const checks = await get(`https://api.github.com/repos/${repository}/commits/${pr.head.sha}/check-runs?per_page=100`) as any;
  const files: RepositoryFile[] = await Promise.all(changed.map(async (file) => { const path = String(file.filename); const contentResponse = await fetch(`https://api.github.com/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(pr.head.sha)}`, { headers }); if (!contentResponse.ok) return { path }; const body = await contentResponse.json() as any; return { path, content: typeof body.content === "string" ? Buffer.from(body.content, "base64").toString("utf8") : undefined }; }));
  return { files, pullRequest: { exists: true, repository, baseBranch: pr.base.ref, headCommit: pr.head.sha, changedFiles: changed.map((file) => String(file.filename)), checks: (checks.check_runs ?? []).map((check: any) => ({ name: String(check.name), status: check.status !== "completed" ? "pending" : check.conclusion === "success" ? "success" : check.conclusion === "cancelled" ? "cancelled" : "failure" })) } };
}
