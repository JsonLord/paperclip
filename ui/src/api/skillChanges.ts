import { api } from "./client";

export interface SkillChange {
  id: string;
  companyId: string;
  skillId: string;
  agentId: string | null;
  changeType: "created" | "updated" | "deleted" | "enabled" | "disabled";
  summary: string | null;
  diff: string | null;
  createdAt: string;
}

export const skillChangesApi = {
  listForSkill: (companyId: string, skillId: string) =>
    api.get<SkillChange[]>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}/changes`,
    ),
  listForAgent: (agentId: string) =>
    api.get<SkillChange[]>(
      `/agents/${encodeURIComponent(agentId)}/skill-changes`,
    ),
};
