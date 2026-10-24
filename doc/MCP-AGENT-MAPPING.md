# MCP servers, agents, and resource folders

One registry describes every MCP server. Three surfaces read from it, so they cannot disagree:

| Surface | What it renders | Source |
| --- | --- | --- |
| Jules dispatch prompt | Only the servers that agent holds, plus its guide path | `MCP_SERVERS` + agent `capabilities` |
| Hermes manager prompt | Every server, so the manager can route by capability | `MCP_SERVERS` |
| `.paperclip/resources/<role>/MCP-GUIDE.md` | Full procedure and limits for that role's servers | `MCP_SERVERS` + workforce catalog |

**Add a server in one place:** `packages/adapters/jules/src/prompts.ts` → `MCP_SERVERS`.
**Grant it to a role in one place:** `server/src/services/founderos-deployment-catalog.ts` → that role's `mcp` array.

## The servers

| Server | Capability token | For | Not for |
| --- | --- | --- | --- |
| Stitch | `stitch` | Design generation for offer surfaces: landing pages, pricing screens, visual direction | Shipped code; a render is not a delivered page |
| v0 by Vercel | `v0` | React/Tailwind implementation of an approved design under `website/` | Auth, payments, persistence that imply a product we lack |
| Context7 | `context7` | Version-specific library docs and examples | Market evidence — it says how a library behaves, not whether anyone wants the product |
| Linear | `linear` | Issue tracking, detailed decomposition behind an outcome | Company state; a business fact that survives lives in `firm/` |
| Tinybird | `tinybird` | Real-time analytics over experiment traffic | Treating traffic as demand, or a click as commitment |
| Neon | `neon` | Disposable Postgres branches for transient experiment data | Source of truth for a business fact |
| Supabase | `supabase` | Postgres + one Edge Function for a capture endpoint | Application infrastructure; deploying it needs approval |
| Agent Dashboards | `dashboard` | Publishing what the company did, as dashboards the founder reads | Anything a remote session needs — see below |

Stitch and v0 are **different servers doing adjacent halves of one job** — Stitch designs, v0 implements. They were conflated once, which sent agents to v0 for design work and produced code for a layout nobody had settled. `fake_door` declares both because the test needs a design first and code second.

`dashboard` is **`localOnly`**, which is not a label but a physical fact: a Jules session is
created with a prompt, a source, and a branch, and there is no way to hand it an environment
variable. So it cannot hold the Space's key. `renderToolSection` filters `localOnly` servers out
of a remote dispatch prompt entirely — naming a capability a worker cannot use invites an attempt,
a failure, and a blocker report that reads like an outage. A remote agent that needs a dashboard
updated asks the Data Presentationalist instead.

`stitch` is the token; the product is called Stitch. The token predates this doc and is stored on live Jules profiles, goals, and outcome templates, so renaming it would break existing grants. Only the prose changed.

## Grants by role

| Role | Key | Servers | Resource folder |
| --- | --- | --- | --- |
| Founder Manager | *(hermes)* | all, for routing | — |
| Evidence Steward | `evidence` | `context7` | `.paperclip/resources/evidence/` |
| Market Analyst | `market` | `context7` | `.paperclip/resources/market/` |
| Future Researcher | `researcher` | `context7`, `tinybird` | `.paperclip/resources/researcher/` |
| Customer Researcher | `customer` | `linear` | `.paperclip/resources/customer/` |
| Growth Experimenter | `experiment` | `stitch`, `v0`, `tinybird`, `supabase` | `.paperclip/resources/experiment/` |
| Commercial Lead | `sales` | `linear` | `.paperclip/resources/sales/` |
| Product Lead | `product` | `tinybird`, `linear`, `neon` | `.paperclip/resources/product/` |
| Product Engineer | `engineering` | `context7`, `v0`, `neon`, `supabase` | `.paperclip/resources/engineering/` |
| Finance Lead | `finance` | `tinybird`, `neon` | `.paperclip/resources/finance/` |
| Business Case Architect | `business` | `context7`, `stitch`, `linear` | `.paperclip/resources/business/` |
| Content & GTM Lead | `content` | `stitch`, `v0`, `tinybird` | `.paperclip/resources/content/` |
| Data Presentationalist | `presentationalist` | `dashboard` | `.paperclip/resources/presentationalist/` |
| PDF Engine Architect | `pdf` | `context7` | `.paperclip/resources/pdf/` |
| Document Compiler | `docs` | `context7`, `linear` | `.paperclip/resources/docs/` |
| Deal Strategist | `deal` | `linear` | `.paperclip/resources/deal/` |
| Discovery Coach | `discovery` | `linear` | `.paperclip/resources/discovery/` |
| Proposal Strategist | `proposal` | `linear`, `context7` | `.paperclip/resources/proposal/` |
| Reddit Community Builder | `reddit` | `context7` | `.paperclip/resources/reddit/` |
| SEO Specialist | `seo` | `context7`, `v0` | `.paperclip/resources/seo/` |
| Behavioral Nudge Engine | `nudge` | `tinybird`, `stitch` | `.paperclip/resources/nudge/` |
| Sprint Prioritizer | `sprint` | `linear`, `tinybird` | `.paperclip/resources/sprint/` |

The last ten roles carry a **persona** vendored from `msitarzewski/agency-agents` (see
`resources/agency-profiles/`). A persona is craft guidance, not an assignment: the goal contract,
the evidence rules, and the write scope all outrank it, and the rendered section says so in those
words. Each role's `PERSONA.md` in the company repository records which file it was given and
which upstream file that came from. Personas are screened for credentials before dispatch, and a
persona whose instructions contradict this company's evidence discipline is recorded in the
catalog's `overrides` note rather than quietly obeyed.

**Only the Data Presentationalist runs locally** (`backend: "hermes_local"`). That is a
consequence of holding the dashboard key, not a preference — and it is why it is the role the
founder calls for both dashboard updates and the visual half of the business plan.
## Resource folders

Written into the **company repository** at bootstrap by `server/src/services/agent-resources.ts`:

```
.paperclip/resources/
├── README.md                 # index of every role's folder
└── <role>/
    ├── MCP-GUIDE.md          # generated: servers, procedure, limits, owned goals
    └── templates/            # yours: founder-supplied format and layout guidance
```

Guides are generated, so editing one by hand is lost on the next bootstrap — edit the catalog.

### Where to put your documents

Put them in `templates/`, **in the company repository**, not this one:

- Business Model Canvas, business plan, pitch structure → `business/templates/`
- Long-form research format and depth bar → `researcher/templates/`
- Fake-door and experiment design conventions → `experiment/templates/`
- Metric definitions and decision thresholds → `product/templates/`, `finance/templates/`

Keep them to method, format, and layout. **Example claims, traction figures, or business data written into a template get copied onward as though they were fact** — the evidence-discipline rules exist because workers pattern-match on whatever shape they are given.

An empty `templates/` folder is a valid state. The prompt tells the agent to say the folder is empty and work from the goal contract, rather than inventing a format and presenting it as the company's.

## Capability vs requirement

A grant is an **advisory capability, not a hard requirement**. The capacity broker treats a template's capability list as advisory and the prompt says so explicitly: an earlier build that treated it as a requirement denied dispatches over tooling the outcome never needed. Only an operator-set goal requirement or an explicit session spec gates admission.

Consequence: naming `neon` in a prompt does not hand the agent a Neon connection. That comes from `JULES_PROFILE_CAPABILITIES` on the Jules profile. A server in a prompt that the profile does not carry is decoration — harmless, but the agent will report it unavailable.


## Asking a peer for part of the job

An agent that cannot finish an outcome alone should say so and ask who can, rather than fake the
missing part. Paperclip already routes work by assignment: an issue with an `assigneeAgentId` and
a status out of `backlog` wakes that agent. A handoff is that mechanism, entered by an agent.

`server/src/services/agent-handoff.ts` resolves a **role name** to the agent playing it in this
company and creates the issue through `issueService.create` — the same call the board uses, so
every rule that governs assignment still applies.

Two transports, because agents do not all have the same reach:

| Runner | Ask | Why this way |
| --- | --- | --- |
| `hermes_local` | `POST /companies/:id/handoff` | Holds a Paperclip credential; `tasks:assign` gates it exactly as an issue create is gated |
| `jules` | a `handoff` file in `.founderos/outbox/<runId>/` | Has no credential at all; a repository write is the one thing it can always do |

The Jules side is not a lesser path bolted on. The outbox reconciler promotes the file on the
server side, where creating a native issue belongs, so the receiving agent cannot tell how the
request arrived.

Three refusals exist because the alternative is a fleet that deadlocks politely:

- **Cycle** — asking the agent that asked you would leave both waiting. The chain is read from
  `createdByAgentId` up the `parentId` line, which is why a handoff records lineage that a plain
  issue create would leave null.
- **Depth** — `requestDepth` existed on the issue row and was never set or read. Now it counts
  hops and stops at `MAX_HANDOFF_DEPTH`.
- **Ambiguity** — if two roles fit the name a worker used, both are returned. Guessing would send
  the deliverable to the wrong agent with no signal anywhere.

A refusal is a 422 naming the reason, so the agent can report a real blocker instead of inventing
a peer. A wake that fails is reported as `woke: false` rather than dropped into a floating
promise: that issue would otherwise sit in `todo` forever with nobody coming.

### How the work gets back

Asked-for work has to come back, and the two runners do it differently because only one of them
can talk to Paperclip:

- A **local** assignee comments on its own issue and `@mentions` the requester. The mention is what
  wakes them, which is why `findMentionedAgents` has to match whole names — it matched only a single
  whitespace-delimited token, so `@Document Compiler` resolved to `document`, matched nothing, and
  woke nobody. Every FounderOS role has a multi-word name, so no agent could ever hand work back
  and no founder could raise one from the board.
- A **Jules** assignee has no credential, so its comment would never post. Its completion candidate
  is the hand-back, and on promotion the server wakes the requester under `handoff_returned`. That
  wake is gated on `requestDepth > 0`: ordinary work is created by the Founder Manager, so returning
  on every completion would start a full manager run each time any worker finished anything.

The handoff description branches on the **assignee's** adapter, since it is the assignee reading it.
An instruction an agent cannot physically follow is worse than none: it produces a comment that
never posts or a mention that never wakes anyone, and both look like the peer being ignored.

Assignment needs an active `companyMemberships` row *and* a `tasks:assign` grant — `hasPermission`
checks membership first and returns false without one. No agent used to get a membership, which is
why only the Founder Manager could assign, and it did so through a `role === "ceo"` legacy branch
rather than through permissions. Bootstrap now writes both.
