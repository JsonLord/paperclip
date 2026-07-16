import { api } from "./client";

export interface AgentMemory {
  id: string;
  agentId: string;
  companyId: string;
  scope: "global" | "project";
  projectId: string | null;
  category: "pattern" | "preference" | "decision" | "learning" | "feedback";
  title: string;
  content: string;
  source: "self" | "ceo" | "board" | "human";
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemoryCreateRequest {
  scope: "global" | "project";
  projectId?: string | null;
  category: "pattern" | "preference" | "decision" | "learning" | "feedback";
  title: string;
  content: string;
  source?: "self" | "ceo" | "board" | "human";
  confidence?: number;
}

export interface AgentMemoryUpdateRequest {
  scope?: "global" | "project";
  projectId?: string | null;
  category?: "pattern" | "preference" | "decision" | "learning" | "feedback";
  title?: string;
  content?: string;
  source?: "self" | "ceo" | "board" | "human";
  confidence?: number;
}

export const agentMemoriesApi = {
  list: (agentId: string, params?: { scope?: string; projectId?: string }) => {
    let path = `/agents/${encodeURIComponent(agentId)}/memories`;
    const qs: string[] = [];
    if (params?.scope) qs.push(`scope=${encodeURIComponent(params.scope)}`);
    if (params?.projectId) qs.push(`projectId=${encodeURIComponent(params.projectId)}`);
    if (qs.length > 0) path += `?${qs.join("&")}`;
    return api.get<AgentMemory[]>(path);
  },
  create: (agentId: string, data: AgentMemoryCreateRequest) =>
    api.post<AgentMemory>(`/agents/${encodeURIComponent(agentId)}/memories`, data),
  update: (agentId: string, memoryId: string, data: AgentMemoryUpdateRequest) =>
    api.patch<AgentMemory>(
      `/agents/${encodeURIComponent(agentId)}/memories/${encodeURIComponent(memoryId)}`,
      data,
    ),
  delete: (agentId: string, memoryId: string) =>
    api.delete<{ ok: true }>(
      `/agents/${encodeURIComponent(agentId)}/memories/${encodeURIComponent(memoryId)}`,
    ),
};
