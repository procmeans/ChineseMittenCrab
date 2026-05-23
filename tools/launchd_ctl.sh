#!/usr/bin/env bash
# Install / manage CMR services as macOS LaunchAgents.
#
# Services:
#   cmr.feishu-default     — feishu_ws_bot --account default (claude / 肖老师)
#   cmr.feishu-xiaocao     — feishu_ws_bot --account xiaocao (codex / 小草)
#   cmr.wechat-default     — wechat_bot --account default (claude / 微信客服)
#   cmr.cloudflared        — cloudflared named tunnel for kf.dancidanyu.com
#
# Each service:
#   - Restarts automatically if it crashes (KeepAlive: SuccessfulExit=false).
#   - Survives reboot (RunAtLoad).
#   - Logs to logs/<service>.log under the repo root.
#
# Usage:
#   ./tools/launchd_ctl.sh install        Install + load all services
#   ./tools/launchd_ctl.sh uninstall      Unload + remove all plists
#   ./tools/launchd_ctl.sh restart        Restart all services
#   ./tools/launchd_ctl.sh status         Show launchctl status + recent log heads
#   ./tools/launchd_ctl.sh logs <name>    Tail one service's log (use service short name)

set -euo pipefail

CMR_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# launchd-written logs live OUTSIDE ~/Documents because TCC blocks LaunchAgents from writing
# inside Documents/Desktop/Downloads on recent macOS. ~/Library/Logs/ is the standard place.
# Manual-launch logs still go to ${CMR_ROOT}/logs (handy during dev), launchd logs go here.
LOG_DIR="${HOME}/Library/Logs/cmr"
LA_DIR="${HOME}/Library/LaunchAgents"
NODE_BIN="$(command -v node)"
CF_BIN="$(command -v cloudflared)"

# PATH for child processes — launchd doesn't inherit shell PATH, so claude / codex CLI need
# absolute discovery. We list every dir where claude / codex / node / cloudflared might live.
PATH_ENV="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

CF_TOKEN_FILE="${CMR_ROOT}/logs/cf_token.txt"
CF_TOKEN=""
if [[ -f "${CF_TOKEN_FILE}" ]]; then
  CF_TOKEN="$(tr -d '\n\r ' < "${CF_TOKEN_FILE}")"
fi

mkdir -p "${LA_DIR}" "${LOG_DIR}"

# ──────────────────────────────────────────────────────────────────────────────
# plist renderers
# ──────────────────────────────────────────────────────────────────────────────

render_node_plist() {
  # Args: label script_relpath account
  local label="$1"
  local script="${CMR_ROOT}/tools/$2"
  local account="$3"
  # Log path embeds the launchd label so each service has a distinct file (no contention).
  local logfile="${LOG_DIR}/${label}.log"

  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${script}</string>
    <string>--account</string>
    <string>${account}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${CMR_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_ENV}</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logfile}</string>
  <key>StandardErrorPath</key>
  <string>${logfile}.err</string>
</dict>
</plist>
EOF
}

render_cloudflared_plist() {
  local label="$1"
  local logfile="${LOG_DIR}/${label}.log"

  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${CF_BIN}</string>
    <string>tunnel</string>
    <string>run</string>
    <string>--token</string>
    <string>${CF_TOKEN}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${CMR_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_ENV}</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logfile}</string>
  <key>StandardErrorPath</key>
  <string>${logfile}.err</string>
</dict>
</plist>
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# Service table
# ──────────────────────────────────────────────────────────────────────────────

# Each row: <short-name>|<plist-renderer>|<extra args to renderer>
SERVICES=(
  "feishu-default|render_node_plist|feishu_ws_bot.js|default"
  "feishu-xiaocao|render_node_plist|feishu_ws_bot.js|xiaocao"
  "wechat-default|render_node_plist|wechat_bot.js|default"
  "cloudflared|render_cloudflared_plist"
)

label_for() { echo "cmr.${1}"; }
plist_path_for() { echo "${LA_DIR}/$(label_for "$1").plist"; }

# ──────────────────────────────────────────────────────────────────────────────
# Commands
# ──────────────────────────────────────────────────────────────────────────────

cmd_install() {
  # Kill any manually-launched copies first so we don't run double instances
  echo "→ Stopping any running CMR processes (manual launches)..."
  pkill -9 -f "feishu_ws_bot.js" || true
  pkill -9 -f "wechat_bot.js" || true
  pkill -9 -f "cloudflared tunnel run" || true
  sleep 1

  if [[ -z "${CF_TOKEN}" ]]; then
    echo "⚠ cloudflared token not found at ${CF_TOKEN_FILE} — cloudflared service will be installed but won't connect until you write the token there."
  fi

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name renderer arg1 arg2 <<< "${entry}"
    local label
    label="$(label_for "${name}")"
    local plist
    plist="$(plist_path_for "${name}")"

    echo "→ Installing ${label}"
    if [[ "${renderer}" == "render_node_plist" ]]; then
      render_node_plist "${label}" "${arg1}" "${arg2}" > "${plist}"
    else
      render_cloudflared_plist "${label}" > "${plist}"
    fi

    # Unload first in case it's already loaded (idempotent install)
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "${plist}"
    echo "   loaded: ${plist}"
  done

  echo
  echo "✓ All services installed. Status:"
  cmd_status
}

cmd_uninstall() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ _ _ <<< "${entry}"
    local label
    label="$(label_for "${name}")"
    local plist
    plist="$(plist_path_for "${name}")"

    echo "→ Removing ${label}"
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
    rm -f "${plist}"
  done
  echo "✓ Uninstalled."
}

cmd_restart() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ _ _ <<< "${entry}"
    local label
    label="$(label_for "${name}")"

    echo "→ Restarting ${label}"
    launchctl kickstart -k "gui/$(id -u)/${label}" 2>/dev/null \
      || echo "   (not loaded — run 'install' first)"
  done
}

cmd_status() {
  printf "%-25s %-10s %-10s %s\n" "SERVICE" "PID" "EXIT" "LATEST LOG LINE"
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ _ _ <<< "${entry}"
    local label
    label="$(label_for "${name}")"

    local raw
    raw="$(launchctl print "gui/$(id -u)/${label}" 2>/dev/null || true)"
    local pid="-"
    local lastexit="-"
    if [[ -n "${raw}" ]]; then
      pid="$(echo "${raw}" | awk '/^[[:space:]]*pid =/ { print $3; exit }')"
      lastexit="$(echo "${raw}" | awk '/^[[:space:]]*last exit code =/ { print $5; exit }')"
      pid="${pid:--}"
      lastexit="${lastexit:--}"
    fi

    local logfile="${LOG_DIR}/${label}.log"
    local last=""
    if [[ -f "${logfile}" ]]; then
      last="$(tail -n 1 "${logfile}" 2>/dev/null | cut -c1-80)"
    fi
    printf "%-25s %-10s %-10s %s\n" "${label}" "${pid}" "${lastexit}" "${last:-(no log yet)}"
  done
}

cmd_logs() {
  local name="${1:-}"
  if [[ -z "${name}" ]]; then
    echo "usage: $0 logs <feishu-default|feishu-xiaocao|wechat-default|cloudflared>" >&2
    exit 1
  fi
  local logfile="${LOG_DIR}/cmr.${name}.log"
  if [[ ! -f "${logfile}" ]]; then
    echo "no log at ${logfile} (service may not have started yet)" >&2
    exit 1
  fi
  exec tail -f "${logfile}"
}

# ──────────────────────────────────────────────────────────────────────────────

case "${1:-}" in
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  logs)      shift; cmd_logs "${1:-}" ;;
  *)
    echo "usage: $0 <install|uninstall|restart|status|logs>" >&2
    exit 1
    ;;
esac
