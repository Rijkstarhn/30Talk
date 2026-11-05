#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$HOME/Library/LaunchAgents/com.30talk.discovery.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"
cat > "$AGENT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.30talk.discovery</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$ROOT/scripts/run_daily_discovery.sh</string></array>
<key>WorkingDirectory</key><string>$ROOT</string>
<key>EnvironmentVariables</key><dict><key>HOME</key><string>$HOME</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
<key>StandardOutPath</key><string>$ROOT/logs/discovery.log</string>
<key>StandardErrorPath</key><string>$ROOT/logs/discovery-error.log</string>
</dict></plist>
EOF
plutil -lint "$AGENT"
launchctl bootout "gui/$(id -u)" "$AGENT" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT"
echo "Installed Daily Discovery: 09:00 local time"
