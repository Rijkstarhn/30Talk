#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LOCK="$ROOT/.30talk-poll.lock"
if ! mkdir "$LOCK" 2>/dev/null; then echo 'Queue worker already running'; exit 0; fi
trap 'rmdir "$LOCK"' EXIT
command -v gh >/dev/null || { echo 'GitHub CLI (gh) missing'; exit 1; }
command -v codex >/dev/null || { echo 'Codex CLI missing'; exit 1; }
# Never pull over uncommitted changes; do not consume tasks in a dirty checkout.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then echo 'Tracked working tree dirty; aborting'; exit 1; fi
git pull --ff-only origin main
QUEUE="$(mktemp)"
trap 'rm -f "$QUEUE"; rmdir "$LOCK"' EXIT
gh issue list --repo Rijkstarhn/30Talk --state open --label 30talk-request --limit 100 --json number,title,labels > "$QUEUE"
while IFS=$'\t' read -r NUMBER ID; do
 [[ -n "${NUMBER:-}" && "$ID" =~ ^[A-Za-z0-9_-]{11}$ ]] || continue
 echo "Processing issue #$NUMBER: $ID"
 if ./scripts/process_video.sh "https://www.youtube.com/watch?v=$ID"; then
   gh issue comment "$NUMBER" --repo Rijkstarhn/30Talk --body "Completed and published: https://www.youtube.com/watch?v=$ID"
   gh issue close "$NUMBER" --repo Rijkstarhn/30Talk
 else
   gh issue comment "$NUMBER" --repo Rijkstarhn/30Talk --body 'Automatic processing failed. Administrator review required; no automatic retry.' || true
   gh issue edit "$NUMBER" --repo Rijkstarhn/30Talk --add-label 30talk-failed || true
 fi
done < <("$ROOT/.venv/bin/python" - "$QUEUE" <<'PY'
import json,sys,re
for item in json.load(open(sys.argv[1])):
 if any(x.get('name')=='30talk-failed' for x in item.get('labels',[])):continue
 m=re.fullmatch(r'\[30Talk\] ([A-Za-z0-9_-]{11})',item['title'])
 if m:print(f"{item['number']}\t{m.group(1)}")
PY
)
