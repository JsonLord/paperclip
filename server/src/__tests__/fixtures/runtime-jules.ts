import type { JulesRemoteSession } from "@paperclipai/adapter-jules/server";
import type { JulesRemoteReader } from "../../services/jules-sessions.js";
/** Controlled remote, same lifecycle interface as the production Jules client. */
export class QualificationJulesRemote implements JulesRemoteReader {
  creates = 0;
  state = "QUEUED";
  pr: string | null = null;
  error: Error | null = null;
  constructor(readonly id = "fixture-session") {}
  async create(): Promise<JulesRemoteSession> {
    this.creates++;
    if (this.error) throw this.error;
    return { id: this.id, state: this.state };
  }
  async getSession(id: string): Promise<JulesRemoteSession> {
    if (this.error) throw this.error;
    if (id !== this.id) throw new Error("Remote ID mismatch");
    return {
      id,
      state: this.state,
      outputs: this.pr ? [{ pullRequest: { url: this.pr } }] : [],
    };
  }
  async listActivities() {
    return { items: [{ id: "fixture-activity" }] };
  }
}
