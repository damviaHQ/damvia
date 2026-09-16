#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -d "$ROOT/scripts/node_modules" ]; then
  echo 'Install the documentation checker first: npm ci --prefix scripts' >&2
  exit 1
fi
exec node "$ROOT/scripts/check-docs.mjs" "$@"
