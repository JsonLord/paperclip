export type JulesRemoteSession = { id: string; state?: string; status?: string; pullRequestUrl?: string; url?: string; activities?: Array<{ id?: string }> };

export class JulesApiClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}
  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey, ...(init?.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Jules API ${response.status}: ${typeof body.error === "string" ? body.error : response.statusText}`);
    return body;
  }
  async createSession(input: { prompt: string; source: string; repository: string; startingBranch: string }): Promise<JulesRemoteSession> {
    return await this.request("/sessions", { method: "POST", body: JSON.stringify({ prompt: input.prompt, sourceContext: { source: input.source, githubRepoContext: { repository: input.repository, startingBranch: input.startingBranch } }, automationMode: "AUTO_CREATE_PR" }) }) as JulesRemoteSession;
  }
  async getSession(id: string): Promise<JulesRemoteSession> { return await this.request(`/sessions/${encodeURIComponent(id)}`) as JulesRemoteSession; }
  async approvePlan(id: string): Promise<void> { await this.request(`/sessions/${encodeURIComponent(id)}:approvePlan`, { method: "POST", body: "{}" }); }
  async sendMessage(id: string, message: string): Promise<void> { await this.request(`/sessions/${encodeURIComponent(id)}:sendMessage`, { method: "POST", body: JSON.stringify({ message }) }); }
}
