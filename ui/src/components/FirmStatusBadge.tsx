import { useQuery } from "@tanstack/react-query";
import { Building2, RefreshCw, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../lib/utils";
import { api } from "../api/client";

interface FirmStatus {
  id: string;
  sourceRepo: string;
  commitSha: string | null;
  fetchedAt: string;
}

async function fetchFirmStatus(companyId: string): Promise<FirmStatus | null> {
  try {
    const res = await api.get<FirmStatus>(`/companies/${companyId}/firm`);
    return res;
  } catch {
    return null;
  }
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function FirmStatusBadge({ companyId, className }: { companyId: string; className?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["firm-status", companyId],
    queryFn: () => fetchFirmStatus(companyId),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <span className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Firm loading…</span>
      </span>
    );
  }

  if (isError || !data) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("flex items-center gap-1 text-xs text-yellow-500", className)}>
            <AlertCircle className="h-3 w-3" />
            <span>No firm data</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Firm context not yet initialized for this company</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors", className)}>
          <Building2 className="h-3 w-3 text-emerald-500" />
          <span className="truncate max-w-[120px]">{data.sourceRepo}</span>
          <span className="shrink-0 text-muted-foreground/60">{timeAgo(data.fetchedAt)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-0.5">
          <div className="font-medium">Firm context: {data.sourceRepo}</div>
          {data.commitSha && <div className="text-muted-foreground font-mono">{data.commitSha.slice(0, 7)}</div>}
          <div className="text-muted-foreground">Updated {timeAgo(data.fetchedAt)}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
