import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  mcpServersApi,
  type McpServer,
  type McpServerCreateRequest,
  type McpServerUpdateRequest,
} from "../api/mcpServers";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Server,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Power,
  PowerOff,
} from "lucide-react";
import { useEffect } from "react";

const transportColors: Record<string, string> = {
  stdio: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  http: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  sse: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const scopeColors: Record<string, string> = {
  company: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  agent: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

interface McpFormState {
  name: string;
  description: string;
  command: string;
  args: string;
  transportType: "stdio" | "http" | "sse";
  transportUrl: string;
  scope: "company" | "agent";
  agentId: string;
}

const emptyForm: McpFormState = {
  name: "",
  description: "",
  command: "",
  args: "",
  transportType: "stdio",
  transportUrl: "",
  scope: "company",
  agentId: "",
};

export function McpServers() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId!;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [form, setForm] = useState<McpFormState>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<McpServer | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "MCP Servers" }]);
  }, [setBreadcrumbs]);

  const serversQuery = useQuery({
    queryKey: queryKeys.mcpServers.list(companyId),
    queryFn: () => mcpServersApi.list(companyId),
    enabled: !!companyId,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: McpServerCreateRequest) => mcpServersApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
      pushToast({ title: "MCP server created" });
      closeDialog();
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to create MCP server" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ serverId, data }: { serverId: string; data: McpServerUpdateRequest }) =>
      mcpServersApi.update(companyId, serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
      pushToast({ title: "MCP server updated" });
      closeDialog();
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to update MCP server" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (serverId: string) => mcpServersApi.delete(companyId, serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
      pushToast({ title: "MCP server deleted" });
      setDeleteConfirm(null);
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to delete MCP server" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => mcpServersApi.sync(companyId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
      pushToast({ title: `Synced ${result.imported} MCP server${result.imported !== 1 ? "s" : ""} from Claude Code` });
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to sync from Claude Code" }),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ serverId, enabled }: { serverId: string; enabled: boolean }) =>
      mcpServersApi.update(companyId, serverId, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(companyId) });
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to toggle MCP server" }),
  });

  const servers = serversQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  function openCreate() {
    setEditingServer(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(server: McpServer) {
    setEditingServer(server);
    setForm({
      name: server.name,
      description: server.description ?? "",
      command: server.command,
      args: server.args.join(" "),
      transportType: server.transportType,
      transportUrl: server.transportUrl ?? "",
      scope: server.scope,
      agentId: server.agentId ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingServer(null);
    setForm(emptyForm);
  }

  function handleSave() {
    const payload = {
      name: form.name,
      description: form.description || null,
      command: form.command,
      args: form.args.split(/\s+/).filter(Boolean),
      transportType: form.transportType,
      transportUrl: form.transportUrl || null,
      scope: form.scope,
      agentId: form.scope === "agent" ? form.agentId || null : null,
    };

    if (editingServer) {
      updateMutation.mutate({ serverId: editingServer.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (!companyId) return null;
  if (serversQuery.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">MCP Servers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage Model Context Protocol servers for your agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 mr-1.5", syncMutation.isPending && "animate-spin")}
            />
            {syncMutation.isPending ? "Syncing..." : "Sync from Claude Code"}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Manually
          </Button>
        </div>
      </div>

      {/* Servers */}
      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Server className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            No MCP servers configured yet. Add one manually or sync from Claude Code.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => {
            const agentName = server.agentId
              ? agents.find((a) => a.id === server.agentId)?.name ?? "Unknown agent"
              : null;

            return (
              <Card key={server.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h4 className="text-sm font-medium truncate">{server.name}</h4>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          transportColors[server.transportType],
                        )}
                      >
                        {server.transportType}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] px-1.5 py-0", scopeColors[server.scope])}
                      >
                        {server.scope}
                      </Badge>
                      {server.source === "claude_code_discovered" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          auto-discovered
                        </Badge>
                      )}
                      {!server.enabled && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        >
                          disabled
                        </Badge>
                      )}
                    </div>
                    {server.description && (
                      <p className="text-xs text-muted-foreground ml-6 line-clamp-2">
                        {server.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/60 ml-6 mt-0.5 font-mono">
                      {server.command} {server.args.join(" ")}
                    </p>
                    {agentName && (
                      <p className="text-xs text-muted-foreground ml-6 mt-0.5">
                        Agent: {agentName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        toggleEnabledMutation.mutate({
                          serverId: server.id,
                          enabled: !server.enabled,
                        })
                      }
                      title={server.enabled ? "Disable" : "Enable"}
                    >
                      {server.enabled ? (
                        <Power className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openEdit(server)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => setDeleteConfirm(server)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingServer ? "Edit MCP Server" : "Add MCP Server"}</DialogTitle>
            <DialogDescription>
              {editingServer
                ? "Update the MCP server configuration."
                : "Add a new MCP server for your agents."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Server name"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What does this server do?"
                rows={2}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Command</label>
              <Input
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="e.g., npx, python, node"
                className="font-mono text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Arguments (space-separated)
              </label>
              <Input
                value={form.args}
                onChange={(e) => setForm({ ...form, args: e.target.value })}
                placeholder="e.g., -y @modelcontextprotocol/server-filesystem"
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Transport Type</label>
                <Select
                  value={form.transportType}
                  onValueChange={(v) =>
                    setForm({ ...form, transportType: v as "stdio" | "http" | "sse" })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="http">http</SelectItem>
                    <SelectItem value="sse">sse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Scope</label>
                <Select
                  value={form.scope}
                  onValueChange={(v) =>
                    setForm({ ...form, scope: v as "company" | "agent" })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.transportType === "http" || form.transportType === "sse") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Transport URL</label>
                <Input
                  value={form.transportUrl}
                  onChange={(e) => setForm({ ...form, transportUrl: e.target.value })}
                  placeholder="https://..."
                  className="font-mono text-sm"
                />
              </div>
            )}

            {form.scope === "agent" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Agent</label>
                <Select
                  value={form.agentId}
                  onValueChange={(v) => setForm({ ...form, agentId: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.command.trim() || isSaving}
            >
              {isSaving ? "Saving..." : editingServer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete MCP Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
