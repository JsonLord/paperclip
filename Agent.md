# Agent.md — Deployment Management & FounderOS Paperclip Guidance

This document serves as the guide for deployment management and ongoing operational best practices for running this codebase on Hugging Face Spaces.

---

## 1. Deployment Configuration

### Target Space
- **Profile:** `Leon4gr45`
- **Space:** `Founder`
- **Full Identifier:** `Leon4gr45/Founder`
- **Frontend Port:** `7860` (mandatory port for Hugging Face Spaces)

### Deployment Method
- **SDK:** `Docker` (recommended default for Node.js / React full-stack control plane applications)

### HF Token & Authentication
- The HF token is provided in environment variable `HF_TOKEN` at execution time.
- Never hardcode the token into source code files. Always read it from the environment (`$HF_TOKEN`).
- All monitoring, log-streaming, and repository upload commands rely on the provided HF token environment variable.

### Required Deployment Files
- `Dockerfile` (exposing port `7860` and setting `PORT=7860`)
- `README.md` with Hugging Face YAML frontmatter:
  ```yaml
  ---
  title: Founder
  sdk: docker
  app_port: 7860
  ---
  ```
- `.hfignore` (excluding `.git`, `node_modules`, `data/`, logs, and temporary caches)
- `Agent.md` (must be committed to git before deployment)

---

## 2. API Exposure and Documentation

### Mandatory Endpoints
Every deployment **must** expose:

- **`/health`**
  - Returns HTTP 200 when the application is ready.
  - Required for Hugging Face to transition the Space status from *starting* -> *running*.
  - Reachable at: `https://Leon4gr45-Founder.hf.space/health` (and `/api/health`)

- **`/api-docs`**
  - Documents all available API endpoints and schemas.
  - Reachable at: `https://Leon4gr45-Founder.hf.space/api-docs` (and `/api/api-docs`)

---

### Functional Endpoints

All endpoints listed here appear in `/api-docs`:

### `/health`
- **Method:** GET
- **Purpose:** Returns operational status and health of the deployment.
- **Request Example:**
  ```http
  GET /health HTTP/1.1
  Host: Leon4gr45-Founder.hf.space
  ```
- **Response Example:**
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "deploymentMode": "authenticated",
    "deploymentExposure": "private",
    "authReady": true,
    "bootstrapStatus": "ready"
  }
  ```

### `/api-docs`
- **Method:** GET
- **Purpose:** Documents all available API endpoints and schemas in JSON or HTML.
- **Request Example:**
  ```http
  GET /api-docs HTTP/1.1
  Host: Leon4gr45-Founder.hf.space
  Accept: application/json
  ```
- **Response Example:**
  ```json
  {
    "title": "FounderOS / Paperclip Control Plane API",
    "version": "1.0.0",
    "description": "API endpoints exposed by Paperclip deployment...",
    "endpoints": [...]
  }
  ```

### `/api/companies`
- **Method:** GET
- **Purpose:** List companies managed by the Paperclip control plane.
- **Request Example:**
  ```http
  GET /api/companies HTTP/1.1
  ```
- **Response Example:**
  ```json
  [
    {
      "id": "comp_123",
      "name": "FounderOS Company",
      "description": "AI operating business",
      "createdAt": "2026-09-19T00:00:00.000Z"
    }
  ]
  ```

### `/api/companies`
- **Method:** POST
- **Purpose:** Create a new company under Paperclip orchestration.
- **Request Example:**
  ```json
  {
    "name": "Acme AI Corp",
    "description": "Autonomous SaaS business"
  }
  ```
- **Response Example:**
  ```json
  {
    "id": "comp_456",
    "name": "Acme AI Corp",
    "description": "Autonomous SaaS business",
    "createdAt": "2026-09-19T00:00:00.000Z"
  }
  ```

### `/api/companies/import/github`
- **Method:** POST
- **Purpose:** Onboard and bootstrap a FounderOS company from a GitHub repository.
- **Request Example:**
  ```json
  {
    "repository": "Leon4gr45/company-repo",
    "name": "FounderOS Startup",
    "contentCommit": "abc1234567890def"
  }
  ```
- **Response Example:**
  ```json
  {
    "company": {
      "id": "comp_789",
      "name": "FounderOS Startup",
      "firmGithubRepo": "Leon4gr45/company-repo"
    },
    "bootstrapped": true,
    "resourcePacks": ["venture-thesis", "market-core"]
  }
  ```

### `/api/agents`
- **Method:** GET
- **Purpose:** List all AI agents across companies, org charts, and roles.
- **Request Example:**
  ```http
  GET /api/agents HTTP/1.1
  ```
- **Response Example:**
  ```json
  [
    {
      "id": "agent_01",
      "companyId": "comp_123",
      "name": "CEO Agent",
      "role": "CEO",
      "adapterType": "jules"
    }
  ]
  ```

### `/api/projects`
- **Method:** GET
- **Purpose:** List projects active in companies.
- **Request Example:**
  ```http
  GET /api/projects HTTP/1.1
  ```
- **Response Example:**
  ```json
  [
    {
      "id": "proj_01",
      "companyId": "comp_123",
      "name": "MVP Product Launch",
      "status": "in_progress"
    }
  ]
  ```

### `/api/issues`
- **Method:** GET
- **Purpose:** List work tickets / issues assigned to agents.
- **Request Example:**
  ```http
  GET /api/issues?companyId=comp_123 HTTP/1.1
  ```
- **Response Example:**
  ```json
  [
    {
      "id": "issue_01",
      "companyId": "comp_123",
      "title": "Validate ICP demand",
      "status": "in_progress",
      "assigneeAgentId": "agent_01"
    }
  ]
  ```

### `/api/goals`
- **Method:** GET
- **Purpose:** List strategic business goals.
- **Request Example:**
  ```http
  GET /api/goals?companyId=comp_123 HTTP/1.1
  ```
- **Response Example:**
  ```json
  [
    {
      "id": "goal_01",
      "companyId": "comp_123",
      "title": "Reach $10k MRR",
      "status": "active"
    }
  ]
  ```

---

## 3. FounderOS Company Overview & Paperclip Setup

### What is Paperclip?
Paperclip is an open-source control plane and orchestration system for zero-human AI-agent companies. While agents (such as Jules, Claude Code, Codex, or OpenClaw) act as individual employees, Paperclip acts as the company operating infrastructure.

### Core Architecture & Capabilities
1. **Multi-Company Control Plane:** Complete data isolation per company.
2. **Org Chart & Governance:** Hierarchies, reporting lines, titles, and approval gates.
3. **Goal Alignment & Ticket System:** Strategic goals cascade down to project milestones and individual agent issues.
4. **Heartbeats & Delegation:** Agents wake on scheduled heartbeats or event triggers to execute tasks autonomously.
5. **Cost Control:** Budget limits per company and agent to prevent runaway API spend.

### FounderOS Integration & Onboarding
FounderOS is integrated natively into Paperclip:
- **GitHub Company Import:** Users onboard companies via `POST /api/companies/import/github` or the UI **Import FounderOS** dialog.
- **Context Extraction:** Paperclip reads `.founderos/` context files (`JULES_CONTEXT.md`, `PAPERCLIP_API.md`, `TOOL_POLICY.md`, `DEPLOYMENT_POLICY.md`).
- **Resource Packs:** Binds required resource packs (e.g. `venture-thesis`, `market-core`, `customer-core`, `core-evidence`).
- **Jules Execution Broker:** Paperclip coordinates execution assignments with Google Jules REST API adapter, enforcing outcome policies, activity logging, and quality gates.

---

## 4. Deployment Workflow & Monitoring Best Practices

### Precondition: Space Cleanliness
Before deploying, use the Hugging Face CLI (`hf`) or Python `huggingface_hub` SDK to inspect the target space (`Leon4gr45/Founder`). Remove any leftover non-project files or legacy repository files.

### Standard Deployment Command
After making code changes and verifying them locally, upload the repository to Hugging Face Spaces:

```bash
hf upload Leon4gr45/Founder --repo-type=space .
```

### Log Streaming & Monitoring Commands

1. **Stream Build Logs (SSE):**
   ```bash
   curl -N \
     -H "Authorization: Bearer $HF_TOKEN" \
     "https://huggingface.co/api/spaces/Leon4gr45/Founder/logs/build"
   ```

2. **Stream Run Logs (SSE):**
   Once the build succeeds, monitor the runtime logs:
   ```bash
   curl -N \
     -H "Authorization: Bearer $HF_TOKEN" \
     "https://huggingface.co/api/spaces/Leon4gr45/Founder/logs/run"
   ```

### Iterative Fix-and-Redeploy Loop
1. Allow up to 300 seconds for build and startup.
2. If any log output indicates build failure (e.g., missing dependencies, build script errors) or runtime crash (e.g., missing environment variables, port binding error):
   - Analyze error stack traces carefully.
   - Fix issues in the local codebase.
   - Run local typechecks (`pnpm -r typecheck`), tests (`pnpm test:run`), and build (`pnpm build`).
   - Redeploy with `hf upload`.
   - Resume log streaming and monitoring until the space enters `RUNNING` status.
3. Test production endpoints once `RUNNING`:
   - `curl -f https://leon4gr45-founder.hf.space/health`
   - `curl -f https://leon4gr45-founder.hf.space/api-docs`
