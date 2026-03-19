#!/usr/bin/env bash

set -euo pipefail

command_name="${1:-status}"
account_name="${2:-default}"
label="cmr.${account_name}"
program_path="$(cd "$(dirname "$0")" && pwd)/feishu_ws_bot.js"

render_plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>node</string>
    <string>${program_path}</string>
    <string>--account</string>
    <string>${account_name}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF
}

case "${command_name}" in
  install)
    render_plist
    ;;
  status)
    echo "LAUNCHAGENT_STATUS ${label}"
    ;;
  *)
    echo "usage: $0 <install|status> [account]" >&2
    exit 1
    ;;
esac
