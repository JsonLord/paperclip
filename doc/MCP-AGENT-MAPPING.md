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

Stitch and v0 are **different servers doing adjacent halves of one job** — Stitch designs, v0 implements. They were conflated once, which sent agents to v0 for design work and produced code for a layout nobody had settled. `fake_door` declares both because the test needs a design first and code second.

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
