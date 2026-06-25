#!/usr/bin/env bash
# Install / manage CMR services as macOS LaunchAgents.
#
# Services:
#   cmr.feishu-default     — feishu_ws_bot --account default (claude / 肖老师)
#   cmr.feishu-xiaocao     — feishu_ws_bot --account xiaocao (codex / 小草)
#   cmr.wechat-default     — wechat_bot --account default (claude / 微信客服)
#   cmr.clawbot-default    — clawbot_bot --account default (扫码微信 ClawBot)
#   cmr.clawbot-<account>  — clawbot_bot --account <account> (additional ClawBot accounts from config/clawbot/*.json)
#   cmr.cloudflared        — cloudflared named tunnel for kf.dancidanyu.com
#
# Each service:
#   - Restarts automatically if it crashes (KeepAlive: SuccessfulExit=false).
#   - Survives reboot (RunAtLoad).
#   - Logs to logs/<service>.log under the repo root.
#
# Usage:
#   ./tools/launchd_ctl.sh install [all|clawbot|clawbot-extra]    Install + load services
#   ./tools/launchd_ctl.sh uninstall [all|clawbot|clawbot-extra]  Unload + remove plists
#   ./tools/launchd_ctl.sh restart [all|clawbot|clawbot-extra]    Restart services
#   ./tools/launchd_ctl.sh status [all|clawbot|clawbot-extra]     Show launchctl status + recent log heads
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
# Sandbox (seatbelt) — 禁止机器人读/写敏感文件夹
# ──────────────────────────────────────────────────────────────────────────────
# config/sandbox/deny.json 有 deny 项时，node 服务用 sandbox-exec 包住，内核层拦截。
SANDBOX_SCRIPT="${CMR_ROOT}/tools/sandbox_profile.sh"
SANDBOX_PROFILE="$("${SANDBOX_SCRIPT}" path 2>/dev/null || true)"
SANDBOX_ACTIVE=0

regen_sandbox() {
  if [[ -x "${SANDBOX_SCRIPT}" ]] && "${SANDBOX_SCRIPT}" gen 2>&1; then
    SANDBOX_ACTIVE=1
    echo "→ 沙箱已启用，机器人将无法访问 deny.json 中的文件夹"
  else
    SANDBOX_ACTIVE=0
    echo "→ 沙箱未启用（config/sandbox/deny.json 为空或不存在）"
  fi
}

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

  # 沙箱启用时，在 node 前插入 sandbox-exec -f <profile>，内核层禁止读/写敏感文件夹。
  local sandbox_lines=""
  if [[ "${SANDBOX_ACTIVE}" == "1" && -f "${SANDBOX_PROFILE}" ]]; then
    sandbox_lines="    <string>/usr/bin/sandbox-exec</string>
    <string>-f</string>
    <string>${SANDBOX_PROFILE}</string>
"
  fi

  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${sandbox_lines}    <string>${NODE_BIN}</string>
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

FIXED_SERVICES=(
  "feishu-default|render_node_plist|feishu_ws_bot.js|default"
  "feishu-xiaocao|render_node_plist|feishu_ws_bot.js|xiaocao"
  "wechat-default|render_node_plist|wechat_bot.js|default"
  "cloudflared|render_cloudflared_plist"
)

clawbot_services() {
  local config_dir="${CMR_ROOT}/config/clawbot"
  [[ -d "${config_dir}" ]] || return 0

  local file account
  while IFS= read -r file; do
    account="$(basename "${file}" .json)"
    [[ "${account}" == *.example ]] && continue
    echo "clawbot-${account}|render_node_plist|clawbot_bot.js|${account}"
  done < <(
    find "${config_dir}" -maxdepth 1 -type f -name '*.json' ! -name '*.example.json' | sort
  )
}

clawbot_extra_services() {
  clawbot_services | awk -F'|' '$1 != "clawbot-default"'
}

all_services() {
  printf '%s\n' "${FIXED_SERVICES[@]}"
  clawbot_services
}

services_for_scope() {
  local scope="${1:-all}"
  case "${scope}" in
    all)
      all_services
      ;;
    clawbot)
      clawbot_services
      ;;
    clawbot-extra)
      clawbot_extra_services
      ;;
    *)
      echo "unknown scope: ${scope} (expected all, clawbot or clawbot-extra)" >&2
      return 1
      ;;
  esac
}

label_for() { echo "cmr.${1}"; }
plist_path_for() { echo "${LA_DIR}/$(label_for "$1").plist"; }

# ──────────────────────────────────────────────────────────────────────────────
# Commands
# ──────────────────────────────────────────────────────────────────────────────

cmd_install() {
  local scope="${1:-all}"
  # 重新生成沙箱 profile，并据此决定 plist 是否用 sandbox-exec 包住 node。
  regen_sandbox
  # Kill any manually-launched copies first so we don't run double instances
  echo "→ Stopping any running CMR processes (manual launches)..."
  case "${scope}" in
    all)
      pkill -9 -f "feishu_ws_bot.js" || true
      pkill -9 -f "wechat_bot.js" || true
      pkill -9 -f "clawbot_bot.js" || true
      pkill -9 -f "clawbot_bridge.py" || true
      pkill -9 -f "cloudflared tunnel run" || true
      ;;
    clawbot)
      pkill -9 -f "clawbot_bot.js" || true
      pkill -9 -f "clawbot_bridge.py" || true
      ;;
    clawbot-extra)
      while IFS='|' read -r name _ _ account; do
        pkill -9 -f "clawbot_bot.js --account ${account}" || true
        pkill -9 -f "clawbot_bridge.py --account ${account}" || true
      done < <(clawbot_extra_services)
      ;;
    *)
      echo "unknown scope: ${scope} (expected all, clawbot or clawbot-extra)" >&2
      exit 1
      ;;
  esac
  sleep 1

  if [[ -z "${CF_TOKEN}" ]]; then
    echo "⚠ cloudflared token not found at ${CF_TOKEN_FILE} — cloudflared service will be installed but won't connect until you write the token there."
  fi

  while IFS='|' read -r name renderer arg1 arg2; do
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
    # bootout 是异步的：等它真正卸载完，否则紧接着 bootstrap 会报 5: Input/output error
    local waited=0
    while launchctl print "gui/$(id -u)/${label}" >/dev/null 2>&1; do
      sleep 0.1
      waited=$((waited + 1))
      [[ ${waited} -ge 30 ]] && break
    done
    # bootstrap 带重试，单个服务失败不影响其余（不让 set -e 整体中断）
    local loaded=0 attempt=0
    while [[ ${attempt} -lt 5 ]]; do
      if launchctl bootstrap "gui/$(id -u)" "${plist}" 2>/dev/null; then loaded=1; break; fi
      sleep 0.3
      attempt=$((attempt + 1))
    done
    if [[ ${loaded} -eq 1 ]]; then
      echo "   loaded: ${plist}"
    else
      echo "   ⚠ bootstrap 失败（已重试）: ${label}"
    fi
  done < <(services_for_scope "${scope}")

  echo
  echo "✓ All services installed. Status:"
  cmd_status "${scope}"
}

cmd_uninstall() {
  local scope="${1:-all}"
  while IFS='|' read -r name _ _ _; do
    local label
    label="$(label_for "${name}")"
    local plist
    plist="$(plist_path_for "${name}")"

    echo "→ Removing ${label}"
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
    rm -f "${plist}"
  done < <(services_for_scope "${scope}")
  echo "✓ Uninstalled."
}

cmd_restart() {
  local scope="${1:-all}"
  while IFS='|' read -r name _ _ _; do
    local label
    label="$(label_for "${name}")"

    echo "→ Restarting ${label}"
    launchctl kickstart -k "gui/$(id -u)/${label}" 2>/dev/null \
      || echo "   (not loaded — run 'install' first)"
  done < <(services_for_scope "${scope}")
}

cmd_status() {
  local scope="${1:-all}"
  printf "%-25s %-10s %-10s %s\n" "SERVICE" "PID" "EXIT" "LATEST LOG LINE"
  while IFS='|' read -r name _ _ _; do
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
  done < <(services_for_scope "${scope}")
}

cmd_logs() {
  local name="${1:-}"
  if [[ -z "${name}" ]]; then
    echo "usage: $0 logs <feishu-default|feishu-xiaocao|wechat-default|clawbot-<account>|cloudflared>" >&2
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
  install)   shift; cmd_install "${1:-all}" ;;
  uninstall) shift; cmd_uninstall "${1:-all}" ;;
  restart)   shift; cmd_restart "${1:-all}" ;;
  status)    shift; cmd_status "${1:-all}" ;;
  logs)      shift; cmd_logs "${1:-}" ;;
  *)
    echo "usage: $0 <install|uninstall|restart|status|logs> [all|clawbot]" >&2
    exit 1
    ;;
esac
