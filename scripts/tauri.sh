#!/usr/bin/env bash
# shellcheck shellcheck=bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Load .env (expand $HOME), without overriding already-set environment variables.
if [ -f "$ROOT_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    case "$line" in
      *=*)
        key="${line%%=*}"
        if [ -z "${!key:-}" ]; then
          val="${line#*=}"
          export "$key"="${val//\$HOME/$HOME}"
        fi
        ;;
    esac
  done < "$ROOT_DIR/.env"
fi

# Updater signing expects the private key *content* (a base64 string),
# not a file path. Resolve the key file we have and load its contents.
private_key_file=""
if [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  private_key_file="$TAURI_SIGNING_PRIVATE_KEY_PATH"
elif [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$TAURI_SIGNING_PRIVATE_KEY" ]; then
  private_key_file="$TAURI_SIGNING_PRIVATE_KEY"
fi

if [ -n "$private_key_file" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$private_key_file")"
fi

exec "$ROOT_DIR/node_modules/@tauri-apps/cli/tauri.js" "$@"