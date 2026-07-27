#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables (key path only; password must be set via CI secret or env)
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^\s*#' "$ROOT_DIR/.env" | grep -v '^\s*$' | xargs)
fi

exec npm run tauri build "$@"
