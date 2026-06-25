#!/usr/bin/env bash
# 把 SwiftPM 可执行文件打包成可双击运行的 .app。
#
# 用法:
#   ./macos/build_app.sh            # release 构建并生成 dist/大闸蟹机器人管理器.app
#   ./macos/build_app.sh debug      # debug 构建（更快）
#
# 产物: macos/dist/大闸蟹机器人管理器.app
set -euo pipefail

CONFIG="${1:-release}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PKG_DIR="${SCRIPT_DIR}/BotManager"
APP_NAME="Crab Bot Manager"
DIST_DIR="${SCRIPT_DIR}/dist"
APP_DIR="${DIST_DIR}/${APP_NAME}.app"
BUNDLE_ID="com.chinesemittencrab.botmanager"

echo "→ 写入仓库根路径到 GeneratedConfig.swift: ${REPO_ROOT}"
cat > "${PKG_DIR}/Sources/BotManager/GeneratedConfig.swift" <<EOF
import Foundation

/// 由 build_app.sh 在构建时重新生成，写入实际仓库根路径。
enum GeneratedConfig {
    static let defaultRepoRoot = "${REPO_ROOT}"
}
EOF

echo "→ swift build (${CONFIG})"
( cd "${PKG_DIR}" && swift build -c "${CONFIG}" )
BIN_PATH="$(cd "${PKG_DIR}" && swift build -c "${CONFIG}" --show-bin-path)/BotManager"

echo "→ 组装 .app 包"
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS" "${APP_DIR}/Contents/Resources"
cp "${BIN_PATH}" "${APP_DIR}/Contents/MacOS/${APP_NAME}"

cat > "${APP_DIR}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>            <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>     <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>      <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>      <string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key>         <string>1.0</string>
  <key>CFBundleShortVersionString</key> <string>1.0</string>
  <key>CFBundlePackageType</key>     <string>APPL</string>
  <key>LSMinimumSystemVersion</key>  <string>13.0</string>
  <key>NSPrincipalClass</key>        <string>NSApplication</string>
  <key>NSHighResolutionCapable</key> <true/>
  <key>CFBundleIconFile</key>        <string>AppIcon</string>
</dict>
</plist>
EOF

# 生成图标（若有 sips/iconutil）。失败也不影响构建。
ICON_SRC="${SCRIPT_DIR}/AppIcon.png"
if [[ -f "${ICON_SRC}" ]] && command -v iconutil >/dev/null 2>&1; then
  echo "→ 生成 AppIcon.icns"
  ICONSET="$(mktemp -d)/AppIcon.iconset"
  mkdir -p "${ICONSET}"
  for s in 16 32 64 128 256 512; do
    sips -z "$s" "$s" "${ICON_SRC}" --out "${ICONSET}/icon_${s}x${s}.png" >/dev/null 2>&1 || true
    d=$((s*2))
    sips -z "$d" "$d" "${ICON_SRC}" --out "${ICONSET}/icon_${s}x${s}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "${ICONSET}" -o "${APP_DIR}/Contents/Resources/AppIcon.icns" 2>/dev/null || true
fi

# 本地 ad-hoc 签名，避免 Gatekeeper 直接拒绝运行。
codesign --force --deep --sign - "${APP_DIR}" 2>/dev/null || \
  echo "  (codesign 跳过 — 首次打开请右键→打开)"

echo
echo "✓ 完成: ${APP_DIR}"
echo "  运行: open \"${APP_DIR}\""
