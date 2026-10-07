#!/usr/bin/env bash
# scripts/build-runtime-bundle.sh — 引擎运行时闭包封盘（M4 发布管线，KStock 同款分层）。
#
# 产出（staging/）：
#   qilin-runtime.tar.gz    运行树闭包：构建产物（apps/web/dist、apps/cli/lib、
#                           packages/**/lib|dist + 各包 package.json + cordis 补丁声明）
#                           + 生产 node_modules 闭包（构建后 pnpm install --prod 重装）
#   desktop-runtime.json    封盘清单：上游 commit/版本、闭包 sha256、入口锚——
#                           打包期随 extraResources 进包，壳启动时校验。
#
# 流程（本地/CI 同源）：浅克隆锁定 commit → 品牌补丁 → 全量安装 → build:qilin
# → 生产重装收闭包 → tar（排除源码/测试/文档）→ 清单。
#
# 用法：bash scripts/build-runtime-bundle.sh
# 环境变量：OPENKYLIN_QILIN_SRC（本地引擎仓，缺省 ../QiLin；CI 不设则走 GitHub 克隆）
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

LOCK_FILE="$REPO_ROOT/upstream/qilin.lock.json"
COMMIT="$(node -p "JSON.parse(require('fs').readFileSync('$LOCK_FILE','utf8')).qilinCommit")"
QILIN_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$LOCK_FILE','utf8')).qilinVersion")"
REPO_URL="$(node -p "JSON.parse(require('fs').readFileSync('$LOCK_FILE','utf8')).qilinRepository")"
STAGING="$REPO_ROOT/staging"
SRC="$STAGING/qilin-src"

mkdir -p "$STAGING"

# 1) 获取锁定 commit 的源码：本地引擎仓（OPENKYLIN_QILIN_SRC，缺省 ../QiLin）
#    有该 commit 就本地 clone（hardlink，快），否则 GitHub 完整克隆（CI 路径）
SOURCE_LOCAL="${OPENKYLIN_QILIN_SRC:-$REPO_ROOT/../QiLin}"
if [ -d "$SOURCE_LOCAL" ] && git -C "$SOURCE_LOCAL" cat-file -e "$COMMIT^{commit}" 2>/dev/null; then
  log "从本地引擎仓 clone $COMMIT"
  rm -rf "$SRC"
  git clone --no-checkout "$SOURCE_LOCAL" "$SRC"
elif git -C "$SRC" rev-parse --verify HEAD >/dev/null 2>&1 && [ "$(git -C "$SRC" rev-parse HEAD)" = "$COMMIT" ]; then
  log "staging checkout 已是锁定 commit，复用"
else
  log "从 $REPO_URL clone $COMMIT"
  rm -rf "$SRC"
  git clone "$REPO_URL" "$SRC"
fi
git -C "$SRC" checkout --detach "$COMMIT" >/dev/null 2>&1
[ "$(git -C "$SRC" rev-parse HEAD)" = "$COMMIT" ] || die "checkout commit 不符：$(git -C "$SRC" rev-parse HEAD) ≠ $COMMIT"

# 2) 品牌补丁（幂等：干净 checkout 上应用；重跑已在位则跳过）
if git -C "$SRC" apply --check "$REPO_ROOT"/patches/shared-web-branding.patch "$REPO_ROOT"/patches/desktop-titlebar-inset.patch 2>/dev/null; then
  log "应用品牌补丁"
  node "$REPO_ROOT/scripts/apply-branding.mjs" "$REPO_ROOT" "$SRC" "$REPO_ROOT/patches/registry.json" || die "品牌补丁应用失败"
else
  log "品牌补丁已在位（重跑），跳过"
fi

# 3) 全量安装 + 引擎构建（构建需要 devDeps；CI=true 免 TTY）
if [ ! -f "$SRC/apps/cli/lib/profile-boot.js" ] || [ ! -f "$SRC/apps/web/dist/index.html" ]; then
  log "安装依赖并构建引擎（一次性，10 分钟级）"
  (cd "$SRC" && CI=true pnpm install && CI=true pnpm run build:qilin)
else
  log "引擎构建产物已在位，跳过构建"
fi
[ -f "$SRC/apps/cli/lib/profile-boot.js" ] || die "缺宿主 boot 模块 apps/cli/lib/profile-boot.js"
[ -f "$SRC/apps/web/dist/index.html" ] || die "缺 web client dist"

# 4) 生产重装：node_modules 从全量（dev+prod）收成运行时闭包。
#    构建产物（lib/dist）在包目录内，不受重装影响。root 的 lefthook
#    postinstall 是 git 钩子工具（devDep），prod 模式必炸——临时摘除
#    （staging checkout 一次性，无需还原）。
log "生产重装（node_modules 收运行时闭包）"
node -e '
const fs = require("fs")
const p = process.argv[1] + "/package.json"
const m = JSON.parse(fs.readFileSync(p, "utf8"))
if (m.scripts) delete m.scripts.postinstall
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n")
' "$SRC"
(cd "$SRC" && rm -rf node_modules && CI=true pnpm install --prod)

# 5) 封盘：tar 排除源码/测试/文档/CI 配置；node_modules 保留 symlink 结构
#    （pnpm 相对链接，同构解压后仍有效）
log "打包 qilin-runtime.tar.gz"
BUNDLE="$STAGING/qilin-runtime.tar.gz"
rm -f "$BUNDLE"
# 排除模式按 bsdtar glob（* 跨目录段）：源码/测试/文档只清 apps|packages 域，
# node_modules 内不做内容筛选（个别包 main 指 src，保守保留）
tar -czf "$BUNDLE" -C "$SRC" \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='.agents' \
  --exclude='snapshots' \
  --exclude='docs' \
  --exclude='apps/*/src' \
  --exclude='apps/web/tests' \
  --exclude='packages/*/src' \
  --exclude='packages/*/tests' \
  --exclude='packages/*/*/src' \
  --exclude='packages/*/*/tests' \
  --exclude='*.md' \
  --exclude='.openkylin-*' \
  --exclude='node_modules/.cache' \
  --exclude='*.tsbuildinfo' \
  .
SHA256="$(shasum -a 256 "$BUNDLE" | awk '{print $1}')"

# 6) 封盘清单
node - "$COMMIT" "$QILIN_VERSION" "$BUNDLE" "$SHA256" << 'EOF'
const [commit, version, bundle, sha256] = process.argv.slice(2)
const fs = require('fs')
const manifest = {
  schemaVersion: 1,
  qilinCommit: commit,
  qilinVersion: version,
  bundle: 'qilin-runtime.tar.gz',
  sha256,
  entry: 'apps/cli/lib/profile-boot.js',
  appBoot: 'packages/boot/app-boot/lib/index.js',
  webDist: 'apps/web/dist',
  builtAt: new Date().toISOString(),
}
fs.writeFileSync(require('path').dirname(bundle) + '/desktop-runtime.json', JSON.stringify(manifest, null, 2) + '\n')
console.log('desktop-runtime.json:', manifest.qilinVersion, manifest.qilinCommit.slice(0, 12), sha256.slice(0, 16))
EOF

log "闭包封盘完成：$BUNDLE ($(du -h "$BUNDLE" | awk '{print $1}'))"
