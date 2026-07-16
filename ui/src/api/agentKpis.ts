import { api } from "./client";

export interface AgentKpi {
  id: string;
  agentId: string;
  companyId: string;
  projectId: string | null;
  runId: string | null;
  taskCompleted: boolean | null;
  completionRate: number | null;
  selfAssessmentScore: number | null;
  tokensUsed: number | null;
  costCents: number | null;
  durationSeconds: number | null;
  durationMs: number | null;
  errorsEncountered: number;
  errorCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KpiTrend {
  totalRuns: number;
  completionRate: number;
  avgCostCents: number;
  avgDurationSeconds: number;
  avgTokensUsed: number;
  trend: "improving" | "declining" | "stable";
}

export interface KpiObservation {
  id: string;
  companyId: string;
  agentId: string | null;
  observerType: "ceo_agent" | "board_human";
  observerAgentId: string | null;
  observerUserId: string | null;
  title: string;
  content: string;
  severity: "info" | "warning" | "critical";
  observation: string;
  agentIds: string[];
  actionTaken: boolean;
  actionNotes: string | null;
  createdAt: string;
}

export interface AgentExperiment {
  id: string;
  agentId: string;
  companyId: string;
  name: string;
  description: string | null;
  result: string | null;
  hypothesis: string;
  approachA: string;
  approachB: string;
  taskType: string | null;
  status: "running" | "concluded";
  winningApproach: string | null;
  runsA: number;
  runsB: number;
  kpiResultsA: Record<string, unknown>;
  kpiResultsB: Record<string, unknown>;
  changeNotes: string | null;
  createdAt: string;
  concludedAt: string | null;
}

export interface CompanyAnalytics {
  totalRuns: number;
  avgCompletionRate: number;
  totalCostCents: number;
  activeAgents: number;
  agentTrends: Array<{
    agentId: string;
    agentName: string;
    completionRate: number | null;
    avgCostCents: number | null;
    avgDurationSeconds: number | null;
    totalRuns: number;
  }>;
  agentSummaries: Array<{
    agentId: string;
    agentName: string;
    totalRuns: number;
    completionRate: number;
    avgCostCents: number;
    avgDurationSeconds: number;
  }>;
}

export interface ExperimentCreateRequest {
  name: string;
  description?: string | null;
  hypothesis: string;
  approachA: string;
  approachB: string;
  taskType?: string;
}

// Internal type for API calls that may include null
export interface ExperimentCreateRequestInternal extends ExperimentCreateRequest {
  hypothesis: string;
}

export interface ExperimentUpdateRequest {
  status?: "running" | "concluded";
  winningApproach?: string;
  changeNotes?: string;
}

export interface ObservationCreateRequest {
  agentId?: string | null;
  title: string;
  content: string;
  severity: "info" | "warning" | "critical";
  observerType?: "ceo_agent" | "board_human";
  observation?: string;
  agentIds?: string[];
  actionTaken?: boolean;
  actionNotes?: string;
}

export const agentKpisApi = {
  list: (agentId: string, params?: { limit?: number }) => {
    let path = `/agents/${encodeURIComponent(agentId)}/kpis`;
    if (params?.limit) path += `?limit=${params.limit}`;
    return api.get<AgentKpi[]>(path);
  },
  trends: (agentId: string) =>
    api.get<KpiTrend>(`/agents/${encodeURIComponent(agentId)}/kpis/trends`),
};

export const analyticsApi = {
  getCompanyAnalytics: (companyId: string) =>
    api.get<CompanyAnalytics>(`/companies/${encodeURIComponent(companyId)}/analytics`),
  listObservations: (companyId: string) =>
    api.get<KpiObservation[]>(
      `/companies/${encodeURIComponent(companyId)}/analytics/observations`,
    ),
  createObservation: (companyId: string, data: ObservationCreateRequest) =>
    api.post<KpiObservation>(
      `/companies/${encodeURIComponent(companyId)}/analytics/observations`,
      data,
    ),
  deleteObservation: (companyId: string, observationId: string) =>
    api.delete<{ success: true }>(
      `/companies/${encodeURIComponent(companyId)}/analytics/observations/${encodeURIComponent(observationId)}`,
    ),
};

export const experimentsApi = {
  list: (agentId: string) =>
    api.get<AgentExperiment[]>(`/agents/${encodeURIComponent(agentId)}/experiments`),
  create: (agentId: string, data: ExperimentCreateRequest) =>
    api.post<AgentExperiment>(
      `/agents/${encodeURIComponent(agentId)}/experiments`,
      data,
    ),
  update: (agentId: string, experimentId: string, data: ExperimentUpdateRequest) =>
    api.patch<AgentExperiment>(
      `/agents/${encodeURIComponent(agentId)}/experiments/${encodeURIComponent(experimentId)}`,
      data,
    ),
  delete: (agentId: string, experimentId: string) =>
    api.delete<{ success: true }>(
      `/agents/${encodeURIComponent(agentId)}/experiments/${encodeURIComponent(experimentId)}`,
    ),
};
