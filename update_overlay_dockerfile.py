import re

with open("deploy/hf-space/overlay/Dockerfile", "r") as f:
    content = f.read()

missing_copies = """COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/"""

if "COPY packages/adapters/jules/package.json packages/adapters/jules/" in content:
    content = content.replace("COPY packages/adapters/jules/package.json packages/adapters/jules/", f"COPY packages/adapters/jules/package.json packages/adapters/jules/\n{missing_copies}")

with open("deploy/hf-space/overlay/Dockerfile", "w") as f:
    f.write(content)

