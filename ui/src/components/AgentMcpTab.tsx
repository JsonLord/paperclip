import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mcpServersApi, type McpServer } from "../api/mcpServers";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, ExternalLink, Plus, Trash2, Settings } from "lucide-react";
import { useState } from "react";

const transportColors: Record<string, string> = {
  stdio: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  http: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  sse: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

interface AgentMcpTabProps {
  agentId: string;
  companyId: string;
  companyPrefix: string;
}

export function AgentMcpTab({ agentId, companyId, companyPrefix }: AgentMcpTabProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [confirmRemove, setConfirmRemove] = useState<{ serverId: string; name: string } | null>(null);

  const serversQuery = useQuery({
    queryKey: queryKeys.mcpServers.list(companyId),
    queryFn: () => mcpServersApi.list(companyId),
  });

  // Add MCP to this agent: create an agent-scoped copy
  const addMutation = useMutation({
    mutationFn: (server: McpServer) =>
      mcpServersApi.create(companyId, {
        name: server.name,
        description: server.description ?? undefined,
        command: server.command,
        args: server.args,
        env: server.env,
        transportType: server.transportType,
        transportUrl: server.transportUrl ?? undefined,
        scope: "agent",
        agentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
      pushToast({ title: "MCP added to this agent" });
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to add MCP" }),
  });

  // Remove MCP from this agent: delete the agent-scoped record
  const removeMutation = useMutation({
    mutationFn: (serverId: string) => mcpServersApi.delete(companyId, serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
      pushToast({ title: "MCP removed from this agent" });
      setConfirmRemove(null);
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to remove MCP" }),
  });

  const servers = serversQuery.data ?? [];

  // MCPs active for this agent (explicitly assigned)
  const agentServers = servers.filter((s) => s.scope === "agent" && s.agentId === agentId && s.enabled);
  const agentServerNames = new Set(agentServers.map((s) => s.name));

  // Available catalog (company-wide MCPs not yet added to this agent)
  const catalogServers = servers.filter(
    (s) => s.scope === "company" && s.enabled && !agentServerNames.has(s.name),
  );

  if (serversQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <div className="h-5 w-40 bg-muted animate-pulse rounded" />
            <div className="h-3 w-64 bg-muted animate-pulse rounded mt-2" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active MCPs for this agent */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            Active MCPs
            {agentServers.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {agentServers.length} enabled
              </span>
            )}
          </h3>
          <Link to={`/${companyPrefix}/mcp-servers`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              <ExternalLink className="h-3 w-3 mr-1" />
              Manage catalog
            </Button>
          </Link>
        </div>

        {agentServers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <Server className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No MCPs active for this agent.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add from the catalog below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agentServers.map((server) => (
              <Card key={server.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{server.name}</span>
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] px-1.5 py-0 shrink-0", transportColors[server.transportType])}
                    >
                      {server.transportType}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                    onClick={() => setConfirmRemove({ serverId: server.id, name: server.name })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {(server.transportUrl || server.command) && (
                  <p className="text-xs text-muted-foreground/50 font-mono mt-1 ml-6 truncate">
                    {server.transportUrl ?? `${server.command} ${server.args.join(" ")}`}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Catalog — available to add */}
      {catalogServers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">
            Available to add
          </h3>
          <div className="space-y-2">
            {catalogServers.map((server) => (
              <Card key={server.id} className="p-3 opacity-70 hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{server.name}</span>
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] px-1.5 py-0 shrink-0", transportColors[server.transportType])}
                    >
                      {server.transportType}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate(server)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {catalogServers.length === 0 && agentServers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Server className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            No MCP servers in the company catalog yet.
          </p>
          <Link to={`/${companyPrefix}/mcp-servers`}>
            <Button variant="outline" size="sm">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Set up MCPs
            </Button>
          </Link>
        </div>
      )}

      {/* Remove confirmation */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg border border-border p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold mb-2">Remove MCP</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Remove <strong>{confirmRemove.name}</strong> from this agent? The agent will lose access to these tools.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(confirmRemove.serverId)}
              >
                {removeMutation.isPending ? "Removing..." : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
