import { api } from "./client";

export interface McpServer {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  env: Record<string, string>;
  transportType: "stdio" | "http" | "sse";
  transportUrl: string | null;
  source: "claude_code_discovered" | "manual";
  scope: "company" | "agent";
  agentId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerCreateRequest {
  name: string;
  description?: string | null;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transportType: "stdio" | "http" | "sse";
  transportUrl?: string | null;
  scope: "company" | "agent";
  agentId?: string | null;
}

export interface McpServerUpdateRequest {
  name?: string;
  description?: string | null;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transportType?: "stdio" | "http" | "sse";
  transportUrl?: string | null;
  scope?: "company" | "agent";
  agentId?: string | null;
  enabled?: boolean;
}

export interface McpSyncResult {
  imported: number;
  servers: McpServer[];
}

export const mcpServersApi = {
  list: (companyId: string) =>
    api.get<McpServer[]>(`/companies/${encodeURIComponent(companyId)}/mcp-servers`),
  create: (companyId: string, data: McpServerCreateRequest) =>
    api.post<McpServer>(`/companies/${encodeURIComponent(companyId)}/mcp-servers`, data),
  sync: (companyId: string) =>
    api.post<McpSyncResult>(
      `/companies/${encodeURIComponent(companyId)}/mcp-servers/sync`,
      {},
    ),
  update: (companyId: string, serverId: string, data: McpServerUpdateRequest) =>
    api.patch<McpServer>(
      `/companies/${encodeURIComponent(companyId)}/mcp-servers/${encodeURIComponent(serverId)}`,
      data,
    ),
  delete: (companyId: string, serverId: string) =>
    api.delete<{ ok: true }>(
      `/companies/${encodeURIComponent(companyId)}/mcp-servers/${encodeURIComponent(serverId)}`,
    ),
  addExclusion: (agentId: string, serverId: string) =>
    api.post<{ ok: true }>(
      `/agents/${encodeURIComponent(agentId)}/mcp-exclusions/${encodeURIComponent(serverId)}`,
      {},
    ),
  removeExclusion: (agentId: string, serverId: string) =>
    api.delete<{ ok: true }>(
      `/agents/${encodeURIComponent(agentId)}/mcp-exclusions/${encodeURIComponent(serverId)}`,
    ),
};
