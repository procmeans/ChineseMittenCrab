#!/usr/bin/env bash
# 从 config/sandbox/deny.json 生成 seatbelt 沙箱 profile。
#
# 机器人进程（feishu/wechat/clawbot 的 node）会被 launchd_ctl.sh 用
#   /usr/bin/sandbox-exec -f <profile> node <script> ...
# 包住，profile 在内核层拒绝对名单内文件夹的读/写——连 shell（cat/ls）都绕不过。
#
# 用法:
#   ./tools/sandbox_profile.sh path     打印 profile 文件路径
#   ./tools/sandbox_profile.sh gen      生成 profile；有 deny 项 -> 退出 0，无 -> 退出 2
set -euo pipefail

CMR_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENY_JSON="${CMR_ROOT}/config/sandbox/deny.json"
PROFILE_DIR="${HOME}/Library/Application Support/cmr/sandbox"
PROFILE_PATH="${PROFILE_DIR}/deny.sb"
NODE_BIN="$(command -v node)"

cmd_path() { echo "${PROFILE_PATH}"; }

cmd_gen() {
  mkdir -p "${PROFILE_DIR}"

  # 用 node 解析 JSON、规范化路径、补 firmlink 备用路径(/System/Volumes/Data/...)，
  # 输出 seatbelt profile。无 deny 项时输出空并以 2 退出。
  local profile
  profile="$(
    "${NODE_BIN}" -e '
      const fs = require("fs");
      const file = process.argv[1];
      let raw = [];
      try {
        const j = JSON.parse(fs.readFileSync(file, "utf8"));
        raw = Array.isArray(j) ? j : (j.denyPaths || []);
      } catch (e) { raw = []; }

      const subs = [];
      for (let p of raw) {
        if (typeof p !== "string") continue;
        p = p.trim().replace(/\/+$/, "");
        if (!p.startsWith("/")) continue;          // 只接受绝对路径
        subs.push(p);
        // APFS firmlink：/Users/... 同时可经 /System/Volumes/Data/Users/... 访问，一并禁掉
        if (!p.startsWith("/System/Volumes/Data/")) {
          subs.push("/System/Volumes/Data" + p);
        }
      }
      if (subs.length === 0) process.exit(2);

      let out = "(version 1)\n(allow default)\n(deny file-read* file-write*\n";
      for (const s of subs) out += "  (subpath " + JSON.stringify(s) + ")\n";
      out += ")\n";
      process.stdout.write(out);
    ' "${DENY_JSON}"
  )" || return 2

  printf '%s' "${profile}" > "${PROFILE_PATH}"
  echo "→ 已生成沙箱 profile: ${PROFILE_PATH}" >&2
  return 0
}

case "${1:-}" in
  path) cmd_path ;;
  gen)  cmd_gen ;;
  *)    echo "usage: $0 <path|gen>" >&2; exit 1 ;;
esac
