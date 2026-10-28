#!/usr/bin/env bash
set -euo pipefail

usage() { echo "Usage: $0 <youtube-url-or-id> [--force]" >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || usage
INPUT="$1"
FORCE="${2:-}"
[[ -z "$FORCE" || "$FORCE" == "--force" ]] || usage

ROOT="$(git rev-parse --show-toplevel)" || { echo "Run inside your Git repository" >&2; exit 1; }
cd "$ROOT"

if [[ "$INPUT" =~ ^[A-Za-z0-9_-]{11}$ ]]; then
  ID="$INPUT"
elif [[ "$INPUT" =~ ^https?://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11}) ]]; then
  ID="${BASH_REMATCH[3]}"
else
  echo "Unsupported URL. Use a standard YouTube watch URL or 11-character ID." >&2
  exit 2
fi

command -v codex >/dev/null || { echo "codex CLI missing" >&2; exit 1; }
[[ -f "$ROOT/fetch_subtitles.py" ]] || { echo "fetch_subtitles.py missing" >&2; exit 1; }
PYTHON="$ROOT/.venv/bin/python"
[[ -x "$PYTHON" ]] || { echo "Python venv missing: $PYTHON" >&2; exit 1; }

DIR="content/$ID"
mkdir -p "$DIR"
if [[ -s "$DIR/en.vtt" && -s "$DIR/zh.vtt" && "$FORCE" != "--force" ]]; then
  "$PYTHON" scripts/validate_subtitles.py "$DIR/en.vtt" "$DIR/zh.vtt"
  echo "Already processed and valid: $ID"
  exit 0
fi

# Fetch into a temporary directory so an existing good file is not overwritten by a failed run.
TMP="$(mktemp -d "$ROOT/.subtitle-tmp.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && "$PYTHON" "$ROOT/fetch_subtitles.py" "$ID")
[[ -s "$TMP/en.vtt" ]] || { echo "Subtitle fetch failed" >&2; exit 1; }
cp "$TMP/en.vtt" "$DIR/en.vtt"
rm -f "$DIR/zh.vtt"

codex exec --skip-git-repo-check --sandbox workspace-write \
  "Translate the entire WebVTT file at $DIR/en.vtt into natural Simplified Chinese, preserving every cue timestamp, count, and order exactly. Write ONLY the translated WebVTT file at $DIR/zh.vtt. Do not modify the English file. Do not install packages or use external tools to obtain translation. If the file is too long, stop and report rather than silently omitting cues."

"$PYTHON" scripts/validate_subtitles.py "$DIR/en.vtt" "$DIR/zh.vtt"

"$PYTHON" - "$ID" "$DIR/metadata.json" <<'PY'
import json, sys
from pathlib import Path
video_id, filename = sys.argv[1:]
Path(filename).write_text(json.dumps({
    'id': video_id,
    'platform': 'youtube',
    'url': f'https://www.youtube.com/watch?v={video_id}',
    'language': 'en',
    'subtitle_status': 'ready'
}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
PY

git add -- "$DIR/en.vtt" "$DIR/zh.vtt" "$DIR/metadata.json"
if git diff --cached --quiet -- "$DIR"; then
  echo "No content changes to commit"
  exit 0
fi
git commit -m "Add translated subtitles for $ID"
# Avoid silently merging or overwriting remote changes.
git push origin HEAD:main
echo "Completed and pushed: $ID"
