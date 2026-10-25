/**
 * Agent-to-agent handoff: asking a peer to finish part of a job, natively.
 *
 * A handoff is not a new subsystem. Paperclip already routes work by assignment: an issue with
 * an `assigneeAgentId` and a status out of `backlog` wakes that agent (`reason:
 * "issue_assigned"`), and a comment containing `@Agent Name` wakes the mentioned agent
 * (`reason: "issue_comment_mentioned"`). Both already exist and are how the board assigns work.
 * The missing piece was that an *agent* could not reach them: assigning requires `tasks:assign`,
 * which only the CEO role holds, and a Jules worker holds no Paperclip credential at all.
 *
 * This service is the server-side half. It creates the issue through `issueService.create` — the
 * same call the HTTP route makes, so every rule that governs assignment still applies:
 * same-company check, terminated/pending assignee, goal resolution, workspace policy, identifier
 * allocation — and then wakes the assignee exactly the way `POST /companies/:id/issues` does.
 * Going through the service rather than inserting rows means a handoff cannot smuggle work past
 * the checks the board is subject to.
 *
 * Why not self-HTTP: the route adds one thing over the service, a permission check on the
 * calling actor, and the actor here is a Jules capability token that has already been authorised
 * for `propose_workstream`. Looping back over the network would need a public base URL this
 * process does not reliably know and a credential the requester does not have, in exchange for a
 * check that would have to be waived anyway.
 *
 * Lineage uses columns that already exist. `createdByAgentId` is stamped with the requesting
 * agent, `parentId` points at the issue being helped, and `requestDepth` counts hops. Walking
 * parents and reading their creator reconstructs the chain with no migration.
 *
 * Three properties were designed in because the alternative is a distributed deadlock:
 *
 *   - **Cycles are refused, not noticed later.** A asks B, B asks A, both wait. The chain is
 *     followed up the parent line, so a request that would close a loop is rejected and named.
 *   - **Depth is bounded.** `requestDepth` existed on the issue row and was never set or read.
 *     It is now incremented per hop and capped, so a runaway fleet stops at a limit instead of
 *     filling the database with issues.
 *   - **Ambiguity is reported, never guessed.** Two roles matching a loose request returns both
 *     names. Silently picking one sends work to the wrong agent with no signal anywhere.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues } from "@paperclipai/db";
import { issueService } from "./issues.js";
import { logActivity } from "./activity-log.js";

/** How many hops a handoff chain may span. A cycle guard, stated as a number as well. */
export const MAX_HANDOFF_DEPTH = 4;

export interface HandoffRequest {
  companyId: string;
  /** The agent asking. Must be an agent of `companyId`. */
  fromAgentId: string;
  /** Role alias or agent name — resolved, never trusted as an id. */
  toRole: string;
  title: string;
  /** What the peer must produce. Written into the issue description. */
  need: string;
  /** Optional acceptance criteria, written under an explicit heading. */
  acceptance?: string[];
  /** Optional material paths the peer should read first. */
  inputs?: string[];
  /** What the requester was doing, so the peer can place the request. */
  context?: string;
  /** The issue the requester is working on. Used for depth, lineage, and inherited goal/project. */
  fromIssueId?: string | null;
  priority?: "low" | "medium" | "high";
  goalId?: string | null;
  projectId?: string | null;
}

export type HandoffResult =
  | { ok: true; issueId: string; identifier: string | null; assignee: { id: string; name: string }; depth: number; woke: boolean; wakeError?: string; wakePending?: boolean }
  | { ok: false; code: "unknown_role" | "ambiguous_role" | "self_request" | "cycle" | "too_deep" | "assignee_unavailable" | "create_failed"; message: string };

/**
 * Where a handoff's rows go and when the peer is woken.
 *
 * A caller that is already inside a transaction must pass its handle. Creating the issue on the
 * ambient connection instead commits it immediately, so if the caller's transaction then rolls
 * back, the peer is left holding an assigned issue nobody asked for — and because the caller's
 * event was never recorded, its retry asks a second time.
 *
 * With that handle, the wake has to be deferred to the caller: waking before the commit means
 * the peer can be woken for an issue that does not exist yet, and loses the race.
 */
export interface HandoffExecution {
  database?: Db;
  deferWake?: boolean;
}

export interface AgentHandoffOptions {
  /**
   * Injectable wake. Defaults to the heartbeat service. A handoff whose wake silently failed is
   * a job that stalls in `todo` forever, so the wake outcome is part of the result rather than
   * dropped into a floating promise.
   */
  wake?: (agentId: string, options: Record<string, unknown>) => Promise<unknown>;
  /** Injectable issue service, so the create-and-wake path can be exercised without a database. */
  issues?: { create(companyId: string, input: Record<string, unknown>): Promise<{ id: string; identifier: string | null }> };
}

/** Aliases are stored comma-joined on `metadata.founderosTemplateId`. */
function aliasesOf(agent: { metadata: unknown }): string[] {
  return String((agent.metadata as Record<string, unknown> | null)?.founderosTemplateId ?? "")
    .split(",")
    .map((alias) => alias.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The body a peer reads. Written so it stands alone: the peer never sees the requester's prompt.
 *
 * The closing instruction differs by how the *assignee* runs, because that decides what it can
 * physically do, and an instruction it cannot follow is worse than no instruction — it produces a
 * comment that never posts or a mention that never wakes anyone, both silently.
 *
 * A locally-run agent holds a Paperclip credential, so it can mention the requester on its own
 * issue and that mention is what wakes them. A Jules session holds no credential at all, so its
 * completion candidate is the hand-back and Paperclip routes the result; telling it to leave a
 * mention would describe a channel it does not have.
 */
export function renderHandoffDescription(input: {
  requesterName: string;
  need: string;
  context?: string;
  inputs?: string[];
  acceptance?: string[];
  assigneeAdapterType?: string;
}): string {
  const returnsItself = input.assigneeAdapterType === "hermes_local";
  return [
    `Requested by ${input.requesterName}.`,
    "",
    "## What is needed",
    input.need.trim(),
    "",
    ...(input.context?.trim() ? ["## Why it is needed now", input.context.trim(), ""] : []),
    ...(input.inputs?.length ? ["## Read first", ...input.inputs.map((path) => `- ${path}`), ""] : []),
    ...(input.acceptance?.length ? ["## Done means", ...input.acceptance.map((line) => `- ${line}`), ""] : []),
    "## How to finish",
    ...(returnsItself
      ? [`Comment on this issue and mention @${input.requesterName} when the deliverable exists — that mention is what wakes them to look.`]
      : ["Submit your completion candidate when the deliverable exists; Paperclip routes the result back to the requester."]),
    "Do not close the requester's own issue — checking the work is their step, and closing it for them removes it.",
  ].join("\n");
}

export function agentHandoffService(db: Db, options: AgentHandoffOptions = {}) {
  // An injected issue service always wins, and is only ever injected by a test; in production the
  // service is bound to whichever database the call is running on, so a handoff inside a caller's
  // transaction writes through that transaction.
  const issuesFor = (database: Db) => options.issues ?? issueService(database);

  async function wakeFn(agentId: string, wakeOptions: Record<string, unknown>) {
    if (options.wake) return options.wake(agentId, wakeOptions);
    const { heartbeatService } = await import("./heartbeat.js");
    return heartbeatService(db).wakeup(agentId, wakeOptions as never);
  }

  /**
   * Resolve a role alias to an agent of this company.
   *
   * Exact match on name or a declared alias wins outright. Only when nothing matches exactly
   * does a normalised substring search run, and it refuses when two agents fit. Without that
   * order, alias `research` and name "Future Researcher" both fuzzy-match "research" and which
   * one receives the work depends on row order.
   */
  async function resolveRole(companyId: string, role: string) {
    const needle = role.trim().toLowerCase();
    if (!needle) return { kind: "unknown" as const };
    const rows = await db
      .select({ id: agents.id, name: agents.name, status: agents.status, metadata: agents.metadata, adapterType: agents.adapterType })
      .from(agents)
      .where(eq(agents.companyId, companyId));

    const exact = rows.filter((row) => row.name.toLowerCase() === needle || aliasesOf(row).includes(needle));
    if (exact.length === 1) return { kind: "found" as const, agent: exact[0]! };
    if (exact.length > 1) return { kind: "ambiguous" as const, candidates: exact.map((row) => row.name) };

    const fuzzy = rows.filter((row) => row.name.toLowerCase().includes(needle) || aliasesOf(row).some((alias) => alias.includes(needle) || needle.includes(alias)));
    if (fuzzy.length === 1) return { kind: "found" as const, agent: fuzzy[0]! };
    if (fuzzy.length > 1) return { kind: "ambiguous" as const, candidates: fuzzy.map((row) => row.name) };
    return { kind: "unknown" as const };
  }

  /**
   * The agents that created this one, nearest first, by walking the parent line.
   *
   * Used for the cycle guard, the depth cap, and — read back into the worker prompt — the reason
   * the agent was woken. That last use is what turns an issue into "the PDF architect needs this
   * rendered" instead of an unexplained task appearing in someone's queue.
   */
  async function requestChain(issueId: string | null | undefined, guard = MAX_HANDOFF_DEPTH + 2): Promise<string[]> {
    const chain: string[] = [];
    let cursor = issueId ?? null;
    while (cursor && chain.length < guard) {
      const [row] = await db
        .select({ parentId: issues.parentId, createdByAgentId: issues.createdByAgentId })
        .from(issues)
        .where(eq(issues.id, cursor))
        .limit(1);
      if (!row?.createdByAgentId) break;
      chain.push(row.createdByAgentId);
      cursor = row.parentId ?? null;
    }
    return chain;
  }

  /** The directory a worker may ask: same company, with a stable ask-key and its state. */
  async function peerDirectory(companyId: string, selfAgentId: string) {
    const rows = await db
      .select({ id: agents.id, name: agents.name, title: agents.title, status: agents.status, metadata: agents.metadata })
      .from(agents)
      .where(eq(agents.companyId, companyId));
    return rows
      .filter((row) => row.id !== selfAgentId)
      .filter((row) => !["terminated", "pending_approval"].includes(row.status))
      .map((row) => ({
        name: row.name,
        title: row.title ?? "",
        askKey: aliasesOf(row)[0] ?? row.name,
        available: row.status !== "paused",
        note: row.status === "paused" ? "paused — cannot take work right now" : "",
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function requestHandoff(input: HandoffRequest, execution: HandoffExecution = {}): Promise<HandoffResult> {
    const database = execution.database ?? db;
    const requester = await database
      .select({ id: agents.id, name: agents.name, companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, input.fromAgentId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!requester || requester.companyId !== input.companyId) {
      return { ok: false, code: "assignee_unavailable", message: "The requesting agent is not an agent of this company." };
    }

    const resolved = await resolveRole(input.companyId, input.toRole);
    if (resolved.kind === "unknown") return { ok: false, code: "unknown_role", message: `No agent in this company answers to "${input.toRole}". Ask for a peer by a name from your directory.` };
    if (resolved.kind === "ambiguous") return { ok: false, code: "ambiguous_role", message: `"${input.toRole}" matches several agents: ${resolved.candidates.join(", ")}. Name one.` };

    const target = resolved.agent;
    if (target.id === requester.id) return { ok: false, code: "self_request", message: "You cannot hand work to yourself. Do it, or escalate to the founder." };
    if (["terminated", "pending_approval"].includes(target.status)) return { ok: false, code: "assignee_unavailable", message: `${target.name} is ${target.status} and cannot take work.` };
    if (target.status === "paused") return { ok: false, code: "assignee_unavailable", message: `${target.name} is paused and will not be woken. Choose another peer or raise it with the founder.` };

    const chain = await requestChain(input.fromIssueId);
    if (chain.includes(target.id)) {
      return { ok: false, code: "cycle", message: `Asking ${target.name} would close a request loop: ${[...chain].reverse().join(" -> ")} -> ${target.name}. Finish your part and report the blocker instead of passing it back.` };
    }
    const depth = chain.length + 1;
    if (depth > MAX_HANDOFF_DEPTH) {
      return { ok: false, code: "too_deep", message: `This request is already ${chain.length} handoffs deep. Stop passing it along and report who has to decide.` };
    }

    // Inherit the requesting issue's goal and project when the caller did not name them, so the
    // peer's work lands in the same place the board is already looking rather than floating
    // loose at company level.
    let goalId = input.goalId ?? null;
    let projectId = input.projectId ?? null;
    if (input.fromIssueId && (!goalId || !projectId)) {
      const [origin] = await database
        .select({ goalId: issues.goalId, projectId: issues.projectId })
        .from(issues)
        .where(and(eq(issues.id, input.fromIssueId), eq(issues.companyId, input.companyId)))
        .limit(1);
      goalId = goalId ?? origin?.goalId ?? null;
      projectId = projectId ?? origin?.projectId ?? null;
    }

    let created: { id: string; identifier: string | null };
    try {
      created = await issuesFor(database).create(input.companyId, {
        title: input.title.trim().slice(0, 300),
        description: renderHandoffDescription({ requesterName: requester.name, need: input.need, context: input.context, inputs: input.inputs, acceptance: input.acceptance, assigneeAdapterType: target.adapterType }),
        // Not `backlog`: a backlog issue does not wake its assignee, and waking is the point.
        status: "todo",
        priority: input.priority ?? "medium",
        assigneeAgentId: target.id,
        createdByAgentId: requester.id,
        requestDepth: depth,
        ...(input.fromIssueId ? { parentId: input.fromIssueId } : {}),
        ...(goalId ? { goalId } : {}),
        ...(projectId ? { projectId } : {}),
      });
    } catch (error) {
      // The service raises domain errors (assignee not assignable, workspace policy). Passing the
      // message through is what lets the calling agent report a real reason rather than a 500.
      return { ok: false, code: "create_failed", message: error instanceof Error ? error.message : String(error) };
    }

    await logActivity(database, {
      companyId: input.companyId,
      actorType: "agent",
      actorId: requester.id,
      agentId: requester.id,
      action: "agent.handoff.requested",
      entityType: "issue",
      entityId: created.id,
      details: { toAgentId: target.id, toAgentName: target.name, via: input.toRole, depth, parentIssueId: input.fromIssueId ?? null },
    });

    if (execution.deferWake) {
      return { ok: true, issueId: created.id, identifier: created.identifier, assignee: { id: target.id, name: target.name }, depth, woke: false, wakePending: true };
    }
    const wake = await wakeAssignee({ issueId: created.id, requesterId: requester.id, targetId: target.id });
    return { ok: true, issueId: created.id, identifier: created.identifier, assignee: { id: target.id, name: target.name }, depth, ...wake };
  }

  /**
   * Same shape the issue route uses for an assignment, so the peer is woken by a handoff the same
   * way it is woken by the board.
   */
  async function wakeAssignee(target: { issueId: string; requesterId: string; targetId: string }) {
    return wakePeer({ ...target, reason: "issue_assigned" });
  }

  /**
   * Wake the agent that asked, because the work it asked for has been reported ready.
   *
   * This is the return leg, and without it a handoff to a Jules worker is a one-way door: the peer
   * finishes, submits its candidate, and the requester keeps waiting for a reply that nothing
   * ever sends. A locally-run assignee closes its own loop by mentioning the requester in a comment
   * — it holds a credential. A Jules session holds none, so the server has to carry the news.
   *
   * Distinct reason rather than reusing `issue_assigned`: an agent woken to *do* a task and an
   * agent woken because a task it delegated came back are different situations, and the wake reason
   * is the only thing its prompt is being told about it.
   */
  async function wakeRequester(returned: { issueId: string; completerAgentId: string; requesterAgentId: string }) {
    return wakePeer({
      issueId: returned.issueId,
      requesterId: returned.completerAgentId,
      targetId: returned.requesterAgentId,
      reason: "handoff_returned",
    });
  }

  async function wakePeer(target: { issueId: string; requesterId: string; targetId: string; reason: string }) {
    let woke = false;
    let wakeError: string | undefined;
    try {
      await wakeFn(target.targetId, {
        source: "assignment",
        triggerDetail: "system",
        reason: target.reason,
        payload: { issueId: target.issueId, mutation: "create", handoffFromAgentId: target.requesterId },
        requestedByActorType: "agent",
        requestedByActorId: target.requesterId,
        contextSnapshot: { issueId: target.issueId, source: "agent.handoff", handoffFromAgentId: target.requesterId },
      });
      woke = true;
    } catch (error) {
      // Reported, not retried. The issue exists and is visible on the board; a second enqueue
      // racing the first would produce two concurrent runs of the same task.
      wakeError = error instanceof Error ? error.message : String(error);
    }
    return { woke, ...(wakeError ? { wakeError } : {}) };
  }

  /** Read back a created handoff, so a caller that must not fly blind can. */
  async function handoffState(issueId: string, companyId: string) {
    const [row] = await db
      .select({ id: issues.id, status: issues.status, identifier: issues.identifier, assigneeAgentId: issues.assigneeAgentId, requestDepth: issues.requestDepth })
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  return { resolveRole, requestChain, requestHandoff, wakeAssignee, wakeRequester, peerDirectory, handoffState };
}
