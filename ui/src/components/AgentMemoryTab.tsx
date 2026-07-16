import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  agentMemoriesApi,
  type AgentMemory,
  type AgentMemoryCreateRequest,
  type AgentMemoryUpdateRequest,
} from "../api/agentMemories";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
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
import { Brain, Plus, Pencil, Trash2, Globe, FolderOpen } from "lucide-react";

const CATEGORIES = ["pattern", "preference", "decision", "learning", "feedback"] as const;
const SOURCES = ["self", "ceo", "board", "human"] as const;

const categoryColors: Record<string, string> = {
  pattern: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  preference: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  decision: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  learning: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  feedback: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const sourceColors: Record<string, string> = {
  self: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  ceo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  board: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  human: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

interface AgentMemoryTabProps {
  agentId: string;
  companyId: string;
}

interface MemoryFormState {
  title: string;
  content: string;
  scope: "global" | "project";
  projectId: string | null;
  category: AgentMemory["category"];
  source: AgentMemory["source"];
  confidence: number;
}

const emptyForm: MemoryFormState = {
  title: "",
  content: "",
  scope: "global",
  projectId: null,
  category: "learning",
  source: "human",
  confidence: 0.8,
};

export function AgentMemoryTab({ agentId, companyId }: AgentMemoryTabProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<AgentMemory | null>(null);
  const [form, setForm] = useState<MemoryFormState>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const memoriesQuery = useQuery({
    queryKey: queryKeys.agentMemories.list(agentId),
    queryFn: () => agentMemoriesApi.list(agentId),
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
  });

  const createMutation = useMutation({
    mutationFn: (data: AgentMemoryCreateRequest) => agentMemoriesApi.create(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentMemories.list(agentId) });
      pushToast({ title: "Memory created" });
      closeDialog();
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to create memory" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ memoryId, data }: { memoryId: string; data: AgentMemoryUpdateRequest }) =>
      agentMemoriesApi.update(agentId, memoryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentMemories.list(agentId) });
      pushToast({ title: "Memory updated" });
      closeDialog();
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to update memory" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: string) => agentMemoriesApi.delete(agentId, memoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentMemories.list(agentId) });
      pushToast({ title: "Memory deleted" });
      setDeleteConfirm(null);
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to delete memory" }),
  });

  const memories = memoriesQuery.data ?? [];
  const globalMemories = memories.filter((m) => m.scope === "global");
  const projectMemories = memories.filter(
    (m) => m.scope === "project" && (!selectedProjectId || m.projectId === selectedProjectId),
  );
  const projects = projectsQuery.data ?? [];

  function openCreate() {
    setEditingMemory(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(memory: AgentMemory) {
    setEditingMemory(memory);
    setForm({
      title: memory.title,
      content: memory.content,
      scope: memory.scope,
      projectId: memory.projectId,
      category: memory.category,
      source: memory.source,
      confidence: memory.confidence,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingMemory(null);
    setForm(emptyForm);
  }

  function handleSave() {
    const payload = {
      title: form.title,
      content: form.content,
      scope: form.scope,
      projectId: form.scope === "project" ? form.projectId : null,
      category: form.category,
      source: form.source,
      confidence: form.confidence,
    };

    if (editingMemory) {
      updateMutation.mutate({ memoryId: editingMemory.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-8">
      {/* Global Memory */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Global Memory</h3>
            <span className="text-xs text-muted-foreground">({globalMemories.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Memory
          </Button>
        </div>

        {globalMemories.length === 0 ? (
          <EmptyMemoryState />
        ) : (
          <div className="space-y-2">
            {globalMemories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onEdit={() => openEdit(memory)}
                onDelete={() => setDeleteConfirm(memory.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Project Memory */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Project Memory</h3>
            <span className="text-xs text-muted-foreground">({projectMemories.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedProjectId ?? "__all__"}
              onValueChange={(v) => setSelectedProjectId(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add
            </Button>
          </div>
        </div>

        {projectMemories.length === 0 ? (
          <EmptyMemoryState />
        ) : (
          <div className="space-y-2">
            {projectMemories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onEdit={() => openEdit(memory)}
                onDelete={() => setDeleteConfirm(memory.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMemory ? "Edit Memory" : "Add Memory"}</DialogTitle>
            <DialogDescription>
              {editingMemory
                ? "Update this memory entry."
                : "Add a new memory to help this agent learn and improve."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Memory title"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Describe the memory..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Scope</label>
                <Select
                  value={form.scope}
                  onValueChange={(v) => setForm({ ...form, scope: v as "global" | "project" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as AgentMemory["category"] })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.scope === "project" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <Select
                  value={form.projectId ?? ""}
                  onValueChange={(v) => setForm({ ...form, projectId: v || null })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Source</label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm({ ...form, source: v as AgentMemory["source"] })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Confidence ({Math.round(form.confidence * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.confidence}
                  onChange={(e) => setForm({ ...form, confidence: parseFloat(e.target.value) })}
                  className="w-full mt-2"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.title.trim() || !form.content.trim() || isSaving}
            >
              {isSaving ? "Saving..." : editingMemory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Memory</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
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

function MemoryCard({
  memory,
  onEdit,
  onDelete,
}: {
  memory: AgentMemory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium truncate">{memory.title}</h4>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", categoryColors[memory.category])}
            >
              {memory.category}
            </Badge>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", sourceColors[memory.source])}
            >
              {memory.source}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{memory.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${memory.confidence * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(memory.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmptyMemoryState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Brain className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">
        No memories yet. Add memories to help this agent learn and improve.
      </p>
    </div>
  );
}
