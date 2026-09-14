export interface GitHubConnectionResult {
  ok: boolean;
  status: number;
  repository: string;
  defaultBranch?: string;
  error?: string;
}

export async function testGitHubConnection(
  repository: string,
  options: { token?: string; apiBaseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<GitHubConnectionResult> {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    return { ok: false, status: 0, repository, error: "Repository must use owner/repo format" };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${base}/repos/${repository}`, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "paperclip-jules-connection-test",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, status: response.status, repository, error: response.status === 404 ? "Repository was not found or the token cannot access it" : `GitHub returned HTTP ${response.status}` };
    }
    return { ok: true, status: response.status, repository, defaultBranch: typeof body.default_branch === "string" ? body.default_branch : undefined };
  } catch {
    return { ok: false, status: 0, repository, error: "GitHub could not be reached" };
  }
}
