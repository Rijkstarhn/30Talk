#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
CONFIG="$HOME/.config/30talk/discovery.env"
[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG" >&2; exit 1; }
# Load a trusted, user-owned configuration file; never commit this file.
set -a
source "$CONFIG"
set +a
[[ -x "$ROOT/.venv/bin/python" ]] || { echo "Missing Python venv" >&2; exit 1; }
command -v gh >/dev/null || { echo "Missing GitHub CLI" >&2; exit 1; }
exec "$ROOT/.venv/bin/python" scripts/daily_discovery.py
