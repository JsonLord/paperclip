export interface JulesPullRequestOutput {
  pullRequest?: {
    url?: string;
    title?: string;
    description?: string;
  };
}

export interface JulesRemoteSession {
  id: string;
  state?: string;
  status?: string;
  title?: string;
  outputs?: JulesPullRequestOutput[];
  updateTime?: string;
}

export interface JulesSource {
  name: string;
  id?: string;
  githubRepo?: { owner?: string; repo?: string };
}

export interface JulesActivity {
  id?: string;
  name?: string;
  createTime?: string;
  [key: string]: unknown;
}

export interface JulesPage<T> {
  items: T[];
  nextPageToken?: string;
}

type JulesCollection = Record<string, unknown> & { nextPageToken?: unknown };

export class JulesApiClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey, ...(init?.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const nestedError = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : null;
      const message = typeof nestedError?.message === "string"
        ? nestedError.message
        : typeof body.error === "string" ? body.error : response.statusText;
      throw new Error(`Jules API ${response.status}: ${message}`);
    }
    return body;
  }

  private page<T>(body: JulesCollection, key: string): JulesPage<T> {
    return {
      items: Array.isArray(body[key]) ? body[key] as T[] : [],
      nextPageToken: typeof body.nextPageToken === "string" ? body.nextPageToken : undefined,
    };
  }

  async listSources(pageToken?: string): Promise<JulesPage<JulesSource>> {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    return this.page<JulesSource>(await this.request(`/sources${query}`), "sources");
  }

  async listSessions(pageToken?: string): Promise<JulesPage<JulesRemoteSession>> {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    return this.page<JulesRemoteSession>(await this.request(`/sessions${query}`), "sessions");
  }

  async createSession(input: {
    prompt: string;
    source: string;
    startingBranch: string;
    requirePlanApproval: boolean;
    title?: string;
  }): Promise<JulesRemoteSession> {
    return await this.request("/sessions", {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        sourceContext: {
          source: input.source,
          githubRepoContext: { startingBranch: input.startingBranch },
        },
        ...(input.title ? { title: input.title } : {}),
        requirePlanApproval: input.requirePlanApproval,
        automationMode: "AUTO_CREATE_PR",
      }),
    }) as unknown as JulesRemoteSession;
  }

  async getSession(id: string): Promise<JulesRemoteSession> {
    return await this.request(`/sessions/${encodeURIComponent(id)}`) as unknown as JulesRemoteSession;
  }

  async listActivities(id: string, pageToken?: string): Promise<JulesPage<JulesActivity>> {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    const body = await this.request(`/sessions/${encodeURIComponent(id)}/activities${query}`);
    return this.page<JulesActivity>(body, "activities");
  }

  async approvePlan(id: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(id)}:approvePlan`, { method: "POST", body: "{}" });
  }

  async sendMessage(id: string, message: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(id)}:sendMessage`, { method: "POST", body: JSON.stringify({ message }) });
  }
}

export function extractPullRequest(session: JulesRemoteSession): { url: string; title?: string; description?: string } | null {
  for (const output of session.outputs ?? []) {
    const url = output.pullRequest?.url?.trim();
    if (url) return { url, title: output.pullRequest?.title, description: output.pullRequest?.description };
  }
  return null;
}
