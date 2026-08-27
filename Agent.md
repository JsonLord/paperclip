# Paperclip-Founder HuggingFace Space Deployment & Operations Guide (`Agent.md`)

This document outlines ongoing deployment best practices, deployment configurations, API documentation, and debugging workflows for the `Leon4gr45/Paperclip-Founder` Hugging Face Space.

---

## 1. Deployment Configuration

### Target Space
- **Profile:** `Leon4gr45`
- **Space:** `Paperclip-Founder`
- **Full Identifier:** `Leon4gr45/Paperclip-Founder`
- **Frontend / Application Port:** `7860` (mandatory for all Hugging Face Spaces)

### Deployment Method
- **SDK:** `docker` (Docker SDK for full control plane environment)

### HF Token
- Environment Variable: `HF_TOKEN`
- Never hardcode the token into codebase source files; always read from environment or environment secrets (`$HF_TOKEN`).

### Required Files
- `Dockerfile`: Multi-stage Docker build for Paperclip control plane + sidecars.
- `README.md`: Frontmatter with Hugging Face Space configuration:
  ```yaml
  ---
  title: Paperclip
  emoji: 📎
  colorFrom: purple
  colorTo: indigo
  sdk: docker
  app_port: 7860
  pinned: false
  ---
  ```
- `.hfignore`: Excludes build artifacts, local `node_modules`, `.git`, `.github`, and temp files to ensure repo file count stays below Hugging Face Hub limits (<20,000 files).
- `Agent.md`: This operational guide file.

---

## 2. API Exposure and Documentation

### Mandatory Endpoints

- **`/health`** (or `/api/health`)
  - **Method:** `GET`
  - **Purpose:** Health check endpoint returning status 200 when the Paperclip server is operational.
  - **Response Example:**
    ```json
    {
      "status": "ok",
      "deploymentMode": "authenticated",
      "deploymentExposure": "public"
    }
    ```

- **`/api-docs`**
  - **Method:** `GET`
  - **Purpose:** Interactive HTML documentation of all available API endpoints.
  - **Reachable at:** `https://Leon4gr45-Paperclip-Founder.hf.space/api-docs`

### Functional Endpoints Summary

- **GET `/health`**
  - Purpose: Service readiness check.

- **GET `/api-docs`**
  - Purpose: HTML documentation page for API endpoints.

- **GET `/api/companies`**
  - Purpose: List all companies.
  - Response Example: `[{"id": "comp_123", "name": "Acme Corp"}]`

- **POST `/api/companies`**
  - Purpose: Create a new company.
  - Request Example: `{"name": "Acme Corp"}`

- **GET `/api/agents`**
  - Purpose: List agents across companies.

- **POST `/api/agents`**
  - Purpose: Register a new agent.
  - Request Example: `{"name": "Dev Agent", "companyId": "comp_123", "role": "engineer"}`

- **GET `/api/projects`**
  - Purpose: List projects within companies.

- **GET `/api/issues`**
  - Purpose: List tasks/issues.

All exposed endpoints are documented within `/api-docs`.

---

## 3. Deployment Workflow & Monitoring

### Standard Upload Command
Run from repository root:
```bash
hf upload Leon4gr45/Paperclip-Founder . --repo-type=space
```

### Log Streaming & Monitoring Commands
Stream build logs (SSE):
```bash
curl -N -H "Authorization: Bearer $HF_TOKEN" \
  "https://huggingface.co/api/spaces/Leon4gr45/Paperclip-Founder/logs/build"
```

Stream run logs (SSE):
```bash
curl -N -H "Authorization: Bearer $HF_TOKEN" \
  "https://huggingface.co/api/spaces/Leon4gr45/Paperclip-Founder/logs/run"
```

### Deployment Verification Cycle
1. Upload codebase via `hf upload`.
2. Stream build logs and monitor status for up to 300 seconds using `huggingface_hub` python API or `curl`.
3. If build/run logs indicate failure, diagnose the issue in the codebase, apply fixes, test locally (`pnpm build`), and redeploy.
4. Verify HTTP readiness at `https://Leon4gr45-Paperclip-Founder.hf.space/health` and `https://Leon4gr45-Paperclip-Founder.hf.space/api-docs`.
