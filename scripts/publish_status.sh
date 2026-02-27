#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/xyt/project/evolver-observer"
NODE_BIN="/Users/xyt/.openclaw/tools/node-v22.22.0/bin/node"
NPM_BIN="/Users/xyt/.openclaw/tools/node-v22.22.0/bin/npm"
LOG_DIR="/Users/xyt/.openclaw/workspace/logs"

mkdir -p "$LOG_DIR"
cd "$REPO_ROOT"

# Ensure dependencies exist (light check)
if [ ! -d "$REPO_ROOT/node_modules" ]; then
  "$NPM_BIN" install >/dev/null 2>&1 || true
fi

"$NODE_BIN" "$REPO_ROOT/scripts/export_status.js" >/dev/null

if git diff --quiet -- public/status/latest.json; then
  exit 0
fi

git add public/status/latest.json
git commit -m "chore(status): update observer snapshot" >/dev/null 2>&1 || exit 0
git push >/dev/null 2>&1 || true
