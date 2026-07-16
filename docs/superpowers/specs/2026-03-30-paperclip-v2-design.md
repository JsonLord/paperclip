# Paperclip V2 — Self-Improving Agents with Memory, Skills, and MCPs

## Overview

Paperclip V2 adds a new **Agent Runtime Layer** between the heartbeat scheduler and adapter execution. This layer gives every agent: persistent per-project conversations, memory, configurable MCP servers, a skill selector with agent-editable skills, and a three-layer self-improvement loop inspired by Karpathy's autoresearch.

The goal: agents that get better over time through accumulated memory, refined skills, analytics-driven CEO/board oversight, and optional active experimentation.

## Design Decisions

- **Approach C chosen**: New runtime layer, minimal changes to heartbeat.ts and adapters
- Sessions: per-agent-per-project (not per-task)
- MCPs: sync from Claude Code + manual add, company defaults + per-agent overrides
- Skills: UI selector wired to existing `desiredSkills`, agents edit skill files directly
- Self-improvement: post-run reflection (every run) + CEO trend review (scheduled) + active experimentation (opt-in)
- Analytics: observe trends over time, surface insights, act only on sustained patterns — not reactive micromanagement
- UX: simple, product-manager style — cancel/delete everywhere, no buried settings

---

## Section 1: Per-Agent-Per-Project Persistent Sessions

**Current**: Sessions keyed by `(agentId, adapterType, taskKey)` — each task may start fresh.

**V2**: Sessions keyed by `(agentId, adapterType, projectId)`. All tasks within the same project share one persistent conversation. Agent accumulates project context naturally.

### Behavior

- When any execution triggers (heartbeat, issue assigned, comment, manual run), the runtime layer resolves the task's project
- Looks up the existing session for that agent+project pair
- Always passes `--resume <sessionId>` to Claude CLI
- Falls back to new session only on first run or if resume fails
- Session compaction handled by Claude's built-in context management — we never voluntarily rotate
- If an agent has no project (org-level work), falls back to a "home" session per agent

### Schema

```sql
CREATE TABLE agent_project_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  adapter_type TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT,
  session_params JSONB,
  session_display_id TEXT,
  last_run_id UUID,
  run_count INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, adapter_type, project_id)
);
```

When `project_id` is NULL, this is the agent's "home" session.

---

## Section 2: Agent Memory System

Persistent knowledge that survives across sessions. Two scopes:

### Global Memory (per agent)
- Cross-project patterns, general expertise, preferences from CEO/board feedback
- Loaded into every run regardless of project

### Project Memory (per agent + project)
- Codebase patterns, debugging tricks, deployment quirks, team preferences
- Loaded only when working on that project

### Runtime Behavior

1. Runtime layer loads agent's global memory + project-specific memory from DB
2. Writes them as markdown files in the agent's managed instructions directory
3. Claude Code picks them up via `--add-dir` or `--append-system-prompt-file`
4. Post-run eval extracts new learnings and writes them back to memory
5. Memory entries have metadata: source, confidence, timestamps

### Schema

```sql
CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('pattern', 'preference', 'decision', 'learning', 'feedback')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('self', 'ceo', 'board', 'human')),
  confidence REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### UI

- Agent detail page gets a "Memory" tab
- Shows global vs project memories, filterable by category and source
- Humans can add, edit, delete memory entries (e.g., CEO writes "always use TypeScript strict mode")
- Read-only view of self-generated memories with option to delete/correct

---

## Section 3: MCP Configuration

### Two paths to configure MCPs

**Path 1 — Sync from Claude Code**: Paperclip scans `~/.claude/settings.json` and project-level `.claude/settings.json` for authenticated MCP servers. Board UI shows discovered MCPs. Human chooses which to import and assigns to company or specific agents.

**Path 2 — Manual add**: From the board MCP settings page, directly configure MCP servers with command, args, transport type, env vars.

### Resolution at runtime

1. Runtime layer queries: company-wide MCPs + agent-specific MCPs - agent exclusions
2. Resolves secret refs in env vars via existing secrets system
3. Writes temp `mcp-config.json`
4. Passes `--mcp-config <path>` to Claude CLI
5. Cleans up temp file after run

### Schema

```sql
CREATE TABLE company_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args JSONB DEFAULT '[]',
  env JSONB DEFAULT '{}',
  transport_type TEXT NOT NULL CHECK (transport_type IN ('stdio', 'http', 'sse')),
  transport_url TEXT,
  source TEXT NOT NULL CHECK (source IN ('claude_code_discovered', 'manual')),
  claude_code_config_path TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('company', 'agent')),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_mcp_exclusions (
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mcp_server_id UUID NOT NULL REFERENCES company_mcp_servers(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, mcp_server_id)
);
```

### UI — MCP Sync Page

- "Sync from Claude Code" button — scans settings, shows new/changed/removed
- List of discovered MCPs with auth status — checkboxes to import
- Active MCPs list with scope tags (company-wide / agent-specific)
- Per-MCP: edit, disable, delete, reassign scope
- Agent settings page: shows which MCPs this agent has, toggle to exclude company defaults

---

## Section 4: Skills — Selector + Agent-Editable Files

### What changes

Skills already exist as files and DB records. The only missing pieces:

1. **Skill selector in agent settings UI** — multi-select of available skills. Maps to existing `adapterConfig.paperclipSkillSync.desiredSkills` array.
2. **Agents edit skill files during runs** — skills are symlinked into agent's working dir, agent can modify them. Changes persist on disk.
3. **Change logging** — runtime layer detects skill file diffs after each run and logs them.

### Schema addition

```sql
CREATE TABLE skill_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES company_skills(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  change_notes TEXT,
  previous_content TEXT,
  new_content TEXT,
  run_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### UI

- Agent settings: skill multi-select with search, shows skill name + description
- Skill detail page: "Change History" tab showing logged changes with diffs
- Agents can be created by CEO with pre-selected skills

---

## Section 5: Self-Improvement Loop — Three Layers

### Layer 1: Post-Run Reflection (every run)

After every run, the runtime layer:
- Records structured KPIs: task completed, tokens used, time taken, errors, cost
- Prompts agent to write a brief self-assessment to memory
- Detects skill file changes and logs diffs with change notes

### Layer 2: CEO/Board Periodic Review (scheduled)

Configurable schedule (every N runs, daily, weekly):
- CEO agent receives a trend report: rolling averages, trend direction, anomalies per agent
- CEO/board can annotate observations without acting
- Changes only when patterns are sustained and meaningful — not reactive
- CEO can push memory updates, reassign skills/MCPs, adjust KPI targets

### Layer 3: Active Experimentation (opt-in)

For agents where CEO/board enables it:
- Agent tracks alternative approaches for recurring task types
- Tries approach A vs B, compares KPI outcomes
- Locks in winner, logs experiment with change notes
- Only on task types flagged safe-to-experiment

### Schema

```sql
CREATE TABLE agent_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  run_id UUID,
  task_completed BOOLEAN,
  self_assessment_score REAL,
  tokens_used BIGINT,
  cost_cents INTEGER,
  duration_seconds INTEGER,
  errors_encountered INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata_key TEXT NOT NULL,
  target_value REAL,
  direction TEXT NOT NULL CHECK (direction IN ('higher_is_better', 'lower_is_better')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hypothesis TEXT NOT NULL,
  approach_a TEXT NOT NULL,
  approach_b TEXT NOT NULL,
  task_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'concluded')),
  winning_approach TEXT,
  runs_a INTEGER DEFAULT 0,
  runs_b INTEGER DEFAULT 0,
  kpi_results_a JSONB DEFAULT '{}',
  kpi_results_b JSONB DEFAULT '{}',
  change_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  concluded_at TIMESTAMPTZ
);

CREATE TABLE agent_kpi_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  observer_type TEXT NOT NULL CHECK (observer_type IN ('ceo_agent', 'board_human')),
  observer_agent_id UUID REFERENCES agents(id),
  observer_user_id UUID,
  observation TEXT NOT NULL,
  agent_ids JSONB DEFAULT '[]',
  action_taken BOOLEAN DEFAULT false,
  action_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### UI

- Agent detail page: "Performance" tab with KPI charts (completion rate, cost per task, time trends)
- Company-level "Analytics" page: all agents side-by-side, trend lines
- Observations log: CEO/board notes with timestamps, linked to agents
- Experiment dashboard: active experiments, results, concluded history

---

## Section 6: Agent Runtime Layer

New service at `server/src/services/agent-runtime/` that sits between heartbeat and adapters.

### Execution Flow

```
Any trigger (heartbeat, issue assigned, comment, manual)
  → heartbeat.executeRun()
    → agentRuntime.execute()
      ├── 1. session-resolver: resolve project, find/create session
      ├── 2. memory-loader: load global + project memory, write to temp files
      ├── 3. mcp-resolver: resolve MCPs, write temp mcp-config.json
      ├── 4. skill-resolver: resolve skills from selector config
      ├── 5. Build enhanced execution context → adapter.execute()
      │
      │   ... adapter runs Claude CLI with --resume, --mcp-config, --add-dir ...
      │
      ├── 6. post-run-eval: record KPIs
      ├── 7. post-run-eval: extract memory updates from run output
      ├── 8. post-run-eval: detect skill file diffs, log changes
      └── 9. post-run-eval: update session state for next run
```

### File Structure

```
server/src/services/agent-runtime/
  index.ts              — main execute() entry, pipeline orchestration
  session-resolver.ts   — per-agent-per-project session logic
  memory-loader.ts      — load/write agent memories to temp files
  mcp-resolver.ts       — build mcp-config.json from DB + Claude Code settings
  skill-resolver.ts     — resolve skills, detect post-run changes
  post-run-eval.ts      — KPI recording, memory extraction, skill diff logging
  kpi-analytics.ts      — trend computation, insight surfacing
```

### Integration Point

In `heartbeat.ts`, the existing call to `adapter.execute()` is wrapped:

```typescript
// Before (current)
const adapterResult = await adapter.execute({ ... });

// After (V2)
const adapterResult = await agentRuntime.execute({
  adapter,
  runId, agent, runtime, config, context,
  onLog, onMeta, onSpawn, authToken,
});
```

Heartbeat keeps all scheduling, queuing, and claiming logic. The runtime layer owns the execution intelligence.

---

## UX Principles

- **Simple and obvious**: every setting has a clear label, no jargon
- **Cancel/delete everywhere**: memory entries, MCP configs, skill assignments, experiments — all deletable
- **Progressive disclosure**: basic config visible by default, advanced (experiments, KPI definitions) behind expandable sections
- **Non-destructive defaults**: syncing MCPs doesn't auto-import, experiments are opt-in, memory can always be deleted
- **Audit trail**: skill changes, KPI observations, experiment results all logged and viewable
