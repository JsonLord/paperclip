#!/usr/bin/env bash
# Update the Hugging Face Space (Leon4gr45/Paperclip-Founder) to the current
# paperclip checkout WITHOUT losing the Space-only configuration.
#
#   ./deploy/hf-space/sync.sh <path-to-space-clone> [--push]
#
# The Space clone is:
#   git clone https://huggingface.co/spaces/Leon4gr45/Paperclip-Founder /tmp/space
#
# What it does, in order:
#   1. refuses to run against a dirty Space clone (so a failed run is recoverable)
#   2. stashes the Space-only paths listed in KEEP into a temp dir
#   3. mirrors the repo's tracked files into the Space clone (deleting stale ones)
#   4. restores the KEEP paths
#   5. applies the overlay/ files (HF Dockerfile, entrypoint, backup, Space README)
#   6. re-injects the pnpm patchedDependencies block the Space needs
#   7. refreshes pnpm-lock.yaml if pnpm is available (upstream does not commit it)
#   8. checks every workspace package has a COPY line in the HF Dockerfile deps stage
#
# Nothing is pushed unless --push is passed.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
space="${1:-}"
push="${2:-}"

die() { echo "error: $*" >&2; exit 1; }
say() { echo "[sync] $*"; }

[ -n "$space" ] || die "usage: $0 <path-to-space-clone> [--push]"
space="$(cd "$space" && pwd)"
[ -d "$space/.git" ] || die "$space is not a git clone of the Space"
git -C "$space" remote -v 2>/dev/null | grep -q "huggingface.co/spaces" \
  || die "$space does not point at a huggingface Space remote"
[ -z "$(git -C "$space" status --porcelain)" ] \
  || die "$space has uncommitted changes — commit or clean it first"

# Space-only paths: created for/inside the Space and absent upstream. Anything
# listed here survives the mirror untouched.
KEEP=(
  .gitattributes        # HF LFS rules
  .hfignore             # HF upload excludes
  Agent.md              # Space deployment/ops runbook
  CLAUDE.md             # Space-local Claude guidance
  deploy                # entrypoint/backup/restore/templates (overlay updates 3 of them)
  docker/hermes-home    # baked HOME for the hermes_local subprocess
  patches               # embedded-postgres locale patch
  FounderOS-DEMO        # company content repo vendored into the Space
  .agents/skills/company-creator
  .claude/skills/company-creator
)

say "repo:  $repo ($(git -C "$repo" rev-parse --short HEAD) on $(git -C "$repo" rev-parse --abbrev-ref HEAD))"
say "space: $space"

stash="$(mktemp -d)"
trap 'rm -rf "$stash"' EXIT
for path in "${KEEP[@]}"; do
  if [ -e "$space/$path" ] || [ -L "$space/$path" ]; then
    mkdir -p "$stash/$(dirname "$path")"
    cp -a "$space/$path" "$stash/$path"
    say "kept $path"
  fi
done

# 3) Mirror the repo's TRACKED files (never node_modules, dist, .paperclip, …).
say "mirroring tracked files"
git -C "$repo" ls-files -z | tar -C "$repo" --null -T - -cf - | tar -C "$space" -xf -

# Delete files the Space still tracks that upstream no longer has: the previous
# lineage's sources and migrations, plus any node_modules/ entries an earlier
# `hf upload` left behind. The image installs dependencies itself, and HF caps a
# repo at 20k files.
stale=0
while IFS= read -r -d '' f; do
  keep=""
  for path in "${KEEP[@]}"; do case "$f" in "$path"|"$path"/*) keep=1;; esac; done
  [ -n "$keep" ] && continue
  [ -e "$repo/$f" ] && continue
  rm -f "$space/$f"; stale=$((stale + 1))
done < <( cd "$space" && git ls-files -z )
say "removed $stale stale file(s)"
find "$space" -depth -type d -empty -not -path "$space/.git/*" -delete 2>/dev/null || true

# The Hub rejects a push that adds a large binary outside LFS, and some Space files
# (doc/assets/header.png, doc/assets/footer.jpg) are stored as LFS pointers. The
# mirror above replaced those pointers with the real blobs, which the pre-receive
# hook declines. Without git-lfs we cannot create new pointers, so restore the ones
# the Space already has. ls-tree -l gives us the blob sizes, so only the handful of
# pointer-sized blobs are inspected.
lfs_kept=0
while IFS= read -r line; do
  size="$(printf '%s' "$line" | awk '{print $4}')"
  path="$(printf '%s' "$line" | cut -f2-)"
  [ "$size" -le 200 ] 2>/dev/null || continue
  [ -e "$space/$path" ] || continue
  blob="$(git -C "$space" cat-file -p "HEAD:$path" 2>/dev/null)" || continue
  case "$blob" in
    "version https://git-lfs.github.com/spec/"*)
      printf '%s\n' "$blob" > "$space/$path"
      lfs_kept=$((lfs_kept + 1))
      ;;
  esac
done < <( git -C "$space" ls-tree -r -l HEAD )
[ "$lfs_kept" -gt 0 ] && say "kept $lfs_kept LFS pointer(s) — install git-lfs to update those binaries"

# 4) Restore the Space-only paths.
for path in "${KEEP[@]}"; do
  [ -e "$stash/$path" ] || [ -L "$stash/$path" ] || continue
  rm -rf "$space/$path"
  mkdir -p "$space/$(dirname "$path")"
  cp -a "$stash/$path" "$space/$path"
done

# 5) Overlay the Space-specific build/runtime files.
say "applying overlay"
tar -C "$here/overlay" -cf - . | tar -C "$space" -xf -
chmod +x "$space"/deploy/*.sh

# 6) The Space runs embedded-postgres as its fallback DB and needs the locale patch
#    declared in package.json. Upstream's package.json has no pnpm.patchedDependencies.
if [ -f "$space/patches/embedded-postgres@18.1.0-beta.16.patch" ]; then
  node - "$space/package.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.pnpm ??= {};
pkg.pnpm.patchedDependencies ??= {};
pkg.pnpm.patchedDependencies["embedded-postgres@18.1.0-beta.16"] =
  "patches/embedded-postgres@18.1.0-beta.16.patch";
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
NODE
  say "re-injected pnpm.patchedDependencies"
fi

# 7) Upstream CLAUDE.md says the lockfile is not committed on feature branches, so a
#    branch adding a workspace package ships a stale one. Refresh it here when we can;
#    the Dockerfile falls back to --no-frozen-lockfile when we cannot.
if command -v pnpm >/dev/null 2>&1; then
  if ( cd "$space" && pnpm install --lockfile-only --ignore-scripts >/dev/null 2>&1 ); then
    say "refreshed pnpm-lock.yaml"
  else
    say "WARNING: could not refresh pnpm-lock.yaml — the image build will fall back to --no-frozen-lockfile"
  fi
else
  say "pnpm not found — the image build will fall back to --no-frozen-lockfile"
fi

# 8) Guard against the failure that broke this upgrade: a new workspace package whose
#    package.json is never COPYied into the deps stage.
missing=0
while read -r manifest; do
  dir="$(dirname "$manifest")"
  case "$dir" in .|server|ui|cli) continue;; esac
  grep -q "COPY $dir/package.json" "$space/Dockerfile" || { echo "  missing COPY for $dir" >&2; missing=1; }
done < <( cd "$repo" && git ls-files '*/package.json' 'package.json' )
[ "$missing" -eq 0 ] || die "add the missing COPY lines to deploy/hf-space/overlay/Dockerfile"
say "Dockerfile deps stage covers every workspace package"

cd "$space"
git add -A
if git diff --cached --quiet; then
  say "Space already up to date"
  exit 0
fi
git status --short > "$stash/status.txt"
head -40 "$stash/status.txt"
say "$(wc -l < "$stash/status.txt") files changed"

if [ "$push" = "--push" ]; then
  git commit -q -m "sync: paperclip $(git -C "$repo" rev-parse --short HEAD) (FounderOS + jules adapter)"
  git push
  say "pushed — watch the Space build logs"
else
  say "staged but not committed. Review, then: git -C $space commit && git push"
fi
