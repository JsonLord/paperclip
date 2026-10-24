# MCP Server to Agent Mapping

## Jules Agents (Remote - MCP via capabilities)

| MCP Server | Agents Using It | Capability Key | Prompt Reference |
|------------|-----------------|----------------|------------------|
| **Context7** | Market Analyst, Evidence Steward | `context7` | "API documentation lookup — always consult before coding" |
| **Linear** | Founder Manager (via hermes), Commitment Analyst | `linear` | "Issue/project tracking — use for structured work tracking" |
| **Tinybird** | Market Analyst, Channel Experimenter, Retention Analyst | `tinybird` | "Real-time analytics — query dashboards for evidence" |
| **v0 by Vercel** | Growth Experimenter (fake-door) | `stitch` | "UI generation — for fake-door frontend code" |
| **Neon** | (Not assigned - available if needed) | `neon` | "Serverless Postgres — only for transient query results" |
| **Supabase** | (Not assigned - available if needed) | `supabase` | "Serverless Postgres — only for transient query results" |

## Hermes Agent (Local - MCP via prompt)

| MCP Server | Agent | Usage in Prompt |
|------------|-------|-----------------|
| **Context7** | Founder Manager | "always consult before coding against a library" |
| **Linear** | Founder Manager | "use for structured work tracking and decomposition" |
| **Tinybird** | Founder Manager | "query dashboards for evidence and metrics" |
| **v0 by Vercel** | Founder Manager | "use for fake-door frontend code and landing pages" |
| **Neon** | Founder Manager | "only for transient query results, never company state" |
| **Supabase** | Founder Manager | "only for transient query results, never company state" |

## Outcome Template → Capability Mapping

| Outcome Template | Capabilities Declared | MCP Servers Used |
|------------------|----------------------|------------------|
| `market_research` | `context7` | Context7 |
| `channel_test` | `tinybird` | Tinybird |
| `fake_door` | `stitch`, `tinybird` | v0, Tinybird |
| `commitment` | `linear` | Linear |
| `concierge` | `linear` | Linear |
| `retention` | `tinybird` | Tinybird |
| All others | none | None declared |

## Implementation Details

### 1. Jules Prompts (dynamic capability-based)
**File**: `packages/adapters/jules/src/prompts.ts`

The "Tools and deployment" section now dynamically renders available MCP servers based on the outcome template's declared capabilities:

```typescript
const mcpMap: Record<string, { name: string; use: string }> = {
  context7: { name: "Context7", use: "API documentation lookup — always consult before coding" },
  linear: { name: "Linear", use: "Issue/project tracking — use for structured work tracking" },
  tinybird: { name: "Tinybird", use: "Real-time analytics — query dashboards for evidence" },
  stitch: { name: "v0 by Vercel", use: "UI generation — for fake-door frontend code" },
  neon: { name: "Neon", use: "Serverless Postgres — only for transient query results" },
  supabase: { name: "Supabase", use: "Serverless Postgres — only for transient query results" },
};
```

### 2. Hermes Prompt (static reference)
**File**: `server/src/services/hermes-prompt.ts`

Added "Available MCP Tools" section after authentication explanation, listing all available servers with usage guidance.

---

## Agent Resource Folder Paths

Each agent has a dedicated resource folder for business documents:

| Agent Key | Resource Folder Path | Purpose |
|-----------|---------------------|---------|
| `evidence` | `.paperclip/resources/evidence/` | Evidence discipline docs |
| `market` | `.paperclip/resources/market/` | Market analysis templates |
| `researcher` | `.paperclip/resources/researcher/` | Long-form research reports |
| `customer` | `.paperclip/resources/customer/` | Customer discovery docs |
| `experiment` | `.paperclip/resources/experiment/` | Experiment templates |
| `sales` | `.paperclip/resources/sales/` | Sales/commercial docs |
| `product` | `.paperclip/resources/product/` | Product strategy docs |
| `engineering` | `.paperclip/resources/engineering/` | Technical docs |
| `finance` | `.paperclip/resources/finance/` | Financial planning docs |
| `business` | `.paperclip/resources/business/` | **Business Model Canvas, Pitch Deck, Business Plan** |
| `content` | `.paperclip/resources/content/` | GTM content templates |

---

## Recommended Document Structure

```
.paperclip/resources/business/
├── business-model-canvas-template.md
├── pitch-deck-outline.md
├── business-plan-template.md
└── financial-model-template.md

.paperclip/resources/market/
├── competitor-analysis-template.md
├── icp-template.md
└── market-size-calculation.md

.paperclip/resources/customer/
├── customer-interview-guide.md
└── problem-statement-template.md

.paperclip/resources/experiment/
├── fake-door-template.md
├── channel-test-template.md
└── conversion-tracking.md
```
