#!/bin/bash
# Auto-start Lulu daemon on system boot (Linux/macOS)
# Run once: ./scripts/install-daemon.sh

set -e

LULU_DIR="$HOME/.lulu"
mkdir -p "$LULU_DIR"

# Get absolute path to lulu repo
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DAEMON_PATH="$SCRIPT_DIR/src/core/daemon.ts"

# Detect platform
if [ "$(uname)" = "Darwin" ]; then
  # macOS: LaunchAgent
  PLIST_DIR="$HOME/Library/LaunchAgents"
  mkdir -p "$PLIST_DIR"
  cat > "$PLIST_DIR/com.lulu.daemon.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lulu.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>bun</string>
    <string>${DAEMON_PATH}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/lulu-daemon.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/lulu-daemon.log</string>
</dict>
</plist>
EOF
  echo "Installed LaunchAgent. Start with: launchctl load ~/Library/LaunchAgents/com.lulu.daemon.plist"

else
  # Linux: systemd
  if [ ! -d "$HOME/.config/systemd/user" ]; then
    mkdir -p "$HOME/.config/systemd/user"
  fi

  BUN_PATH=$(which bun 2>/dev/null || echo "bun")

  cat > "$HOME/.config/systemd/user/lulu-daemon.service" << EOF
[Unit]
Description=Lulu Personal AI Agent
After=network.target

[Service]
Type=simple
ExecStart=$BUN_PATH $DAEMON_PATH start
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

  echo "Installed systemd unit. Run:"
  echo "  systemctl --user daemon-reload"
  echo "  systemctl --user enable lulu-daemon"
  echo "  systemctl --user start lulu-daemon"
fi

echo "Done. Lulu will start automatically on next boot."