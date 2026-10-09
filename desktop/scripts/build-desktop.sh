#!/usr/bin/env bash
# scripts/build-desktop.sh — QiLin Desktop 桌面打包（M4，KStock 同款分层）。
#
# 链条：运行时闭包（build-runtime-bundle.sh，幂等可跳过）→ 组装 app 目录
#（壳源 + 品牌图标 + 打包 package.json）→ electron-builder（dmg/zip，arm64）。
# 产物：dist-exe/QiLin Desktop-<ver>-arm64.dmg/.zip + latest-mac.yml/blockmap
#（自动更新元数据，builder 依 publish 配置生成）。
#
# 用法：bash scripts/build-desktop.sh [--skip-bundle]
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

SKIP_BUNDLE=false
[ "${1:-}" = "--skip-bundle" ] && SKIP_BUNDLE=true

# 1) 运行时闭包（幂等；重跑且 staging 已有产物时 --skip-bundle 可跳）
if [ "$SKIP_BUNDLE" = false ]; then
  bash "$REPO_ROOT/scripts/build-runtime-bundle.sh"
fi
[ -f "$REPO_ROOT/staging/qilin-runtime.tar.gz" ] || die "缺运行时闭包 staging/qilin-runtime.tar.gz"
[ -f "$REPO_ROOT/staging/desktop-runtime.json" ] || die "缺封盘清单 staging/desktop-runtime.json"

# 2) electron-builder 工具（仓库零依赖约束：装进 .tmp，不入 package.json）
BUILDER_TOOL="$REPO_ROOT/.tmp/dev/builder-tool"
BUILDER_BIN="$BUILDER_TOOL/node_modules/.bin/electron-builder"
if [ ! -x "$BUILDER_BIN" ]; then
  log "安装 electron-builder 到 .tmp/dev/builder-tool（一次性）"
  mkdir -p "$BUILDER_TOOL"
  printf '{"name":"openkylin-builder-tool","private":true,"version":"0.0.0"}\n' > "$BUILDER_TOOL/package.json"
  (cd "$BUILDER_TOOL" && npm install --no-save --loglevel=error electron-builder@26)
fi
[ -x "$BUILDER_BIN" ] || die "electron-builder 安装失败"

# 3) 组装 app 目录（builder files 域不可越包目录，壳源复制进 package/app）
log "组装 app 目录"
APP_DIR="$REPO_ROOT/package"
rm -rf "$APP_DIR/app" "$APP_DIR/icons"
mkdir -p "$APP_DIR/app" "$APP_DIR/branding/icons"
cp -R "$REPO_ROOT/main" "$APP_DIR/app/main"
cp -R "$REPO_ROOT/host" "$APP_DIR/app/host"
cp -R "$REPO_ROOT/preload" "$APP_DIR/app/preload"
cp -R "$REPO_ROOT/renderer" "$APP_DIR/app/renderer"
cp "$REPO_ROOT/branding/icons/qilin-512.png" "$APP_DIR/branding/icons/"
cp "$REPO_ROOT/branding/icons/qilin.icns" "$APP_DIR/branding/icons/"
cp "$REPO_ROOT/branding/icons/tray.png" "$APP_DIR/branding/icons/"
cp "$REPO_ROOT/branding/icons/tray@2x.png" "$APP_DIR/branding/icons/"
cp "$REPO_ROOT/branding/icons/tray-dark.png" "$APP_DIR/branding/icons/"
cp "$REPO_ROOT/branding/icons/tray-dark@2x.png" "$APP_DIR/branding/icons/"
node -e '
const pkg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
const root = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"))
pkg.version = root.version
require("fs").writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2) + "\n")
' "$APP_DIR/package.json" "$REPO_ROOT/package.json"

# 3.5) 安装打包域依赖：electron-updater（进 asar 的 dependencies）+ electron
#（devDependencies，builder 只取版本号并自行下载 dist——SKIP_BINARY 省一次下载）
log "安装打包域依赖（electron-updater + electron 版本锚）"
(cd "$APP_DIR" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --loglevel=error)

# 4) 签名钥匙串引导（CI 注入 MAC_CERTIFICATE 时生效；本地无凭据自动跳过
#    = 未签名包）。CSC_LINK 临时钥匙串分支上游缺陷，走 KStock 同款
#    CSC_KEYCHAIN + CSC_NAME 专用钥匙串路线（见 ensure-macos-keychain.sh）。
if [ -n "${MAC_CERTIFICATE:-}" ]; then
  log "签名钥匙串引导"
  source "$REPO_ROOT/scripts/ensure-macos-keychain.sh"
else
  log "未注入 MAC_CERTIFICATE——出未签名包（本地开发形态）"
fi

# 5) 打包（dmg/zip，arm64）。
#    Electron dist 下载走镜像（@electron/get 同 dev.mjs 的镜像策略）
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
# --publish never：Release 上传是发布 job（gh release create）的职责。builder
# 见 git tag + publish: github 配置会触发隐式发布（v0.1.0 第四轮实踩：构建步
# 无 GH_TOKEN → GitHubPublisher ×4 → Cannot cleanup 退出 1）
log "electron-builder 打包（mirror: ${ELECTRON_MIRROR}）"
(cd "$APP_DIR" && "$BUILDER_BIN" --config electron-builder.yml --publish never)

log "打包完成：dist-exe/"
ls -la "$REPO_ROOT/dist-exe/" | grep -E "dmg|zip|yml|blockmap" || true
