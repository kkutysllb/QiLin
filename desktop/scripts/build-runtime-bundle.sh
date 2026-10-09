#!/usr/bin/env bash
# scripts/build-runtime-bundle.sh — 引擎运行时闭包封盘（发布管线）。
#
# 引擎即本仓（desktop/ 并入麒麟仓后）：不再克隆锁定副本，从当前 HEAD 的
# git worktree 构建——与开发工作区隔离，生产重装不碰开发的 node_modules。
#
# 产出（staging/）：
#   qilin-runtime.tar.gz    运行树闭包：构建产物（apps/web/dist、apps/cli/lib、
#                           packages/**/lib|dist + 各包 package.json + cordis 补丁声明）
#                           + 生产 node_modules 闭包（构建后 pnpm install --prod 重装）
#   desktop-runtime.json    封盘清单：仓库 commit/版本、闭包 sha256、入口锚——
#                           打包期随 extraResources 进包，壳启动时校验。
#
# 流程（本地/CI 同源）：worktree 检出当前 HEAD → 全量安装 → build:qilin →
# 生产重装收闭包 → 闭包预签（CI 凭据在场时）→ tar（排除源码/测试/文档）→ 清单。
#
# 用法：bash scripts/build-runtime-bundle.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
ENGINE_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
STAGING="$REPO_ROOT/staging"
SRC="$STAGING/qilin-src"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

COMMIT="$(git -C "$ENGINE_ROOT" rev-parse HEAD)"
QILIN_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$ENGINE_ROOT/package.json','utf8')).version")"

mkdir -p "$STAGING"

# 1) 引擎工作树：当前 HEAD，独立 node_modules。已注册且 HEAD 一致则复用。
worktree_registered() { git -C "$ENGINE_ROOT" worktree list --porcelain | grep -q "^worktree $SRC$"; }
if [ -d "$SRC" ] && [ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null)" = "$COMMIT" ] && worktree_registered; then
  log "worktree 已是当前 HEAD（${COMMIT:0:12}），复用"
else
  log "检出引擎工作树 ${COMMIT:0:12}"
  git -C "$ENGINE_ROOT" worktree remove --force "$SRC" 2>/dev/null || rm -rf "$SRC"
  git -C "$ENGINE_ROOT" worktree prune
  git -C "$ENGINE_ROOT" worktree add --detach "$SRC" "$COMMIT" >/dev/null
fi

# 2) 全量安装 + 引擎构建（构建需要 devDeps；CI=true 免 TTY）
if [ ! -f "$SRC/apps/cli/lib/profile-boot.js" ] || [ ! -f "$SRC/apps/web/dist/index.html" ]; then
  log "安装依赖并构建引擎（一次性，10 分钟级）"
  (cd "$SRC" && CI=true pnpm install && CI=true pnpm run build:qilin)
else
  log "引擎构建产物已在位，跳过构建"
fi
[ -f "$SRC/apps/cli/lib/profile-boot.js" ] || die "缺宿主 boot 模块 apps/cli/lib/profile-boot.js"
[ -f "$SRC/apps/web/dist/index.html" ] || die "缺 web client dist"

# 3) 生产重装：node_modules 从全量（dev+prod）收成运行时闭包。
#    构建产物（lib/dist）在包目录内，不受重装影响。root 的 lefthook
#    postinstall 是 git 钩子工具（devDep），prod 模式必炸——临时摘除
#    （封盘后还原，worktree 复用时保持干净）。
log "生产重装（node_modules 收运行时闭包）"
node -e '
const fs = require("fs")
const p = process.argv[1] + "/package.json"
const m = JSON.parse(fs.readFileSync(p, "utf8"))
if (m.scripts) delete m.scripts.postinstall
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n")
' "$SRC"
(cd "$SRC" && rm -rf node_modules && CI=true pnpm install --prod)

# 4) 闭包预签：公证服务会扫描包内嵌套归档（app → extraResources tar →
#    node_modules），闭包里每个 Mach-O 都须带 Developer ID 签名 + 安全
#    时间戳 + hardened runtime（v0.1.0 第五轮实踩：node-pty/sharp/esbuild/
#    ripgrep 等 23 个二进制无签名，notarytool 整批驳回）。无凭据环境
#    （本地开发）跳过——出未签名闭包。签名在 tar 之前，清单 sha256
#    随签后产物计算，无需改封盘流程。
if [ "$(uname -s)" = "Darwin" ] && [ -n "${MAC_CERTIFICATE:-}" ]; then
  log "闭包预签（Developer ID + hardened runtime + secure timestamp）"
  source "$REPO_ROOT/scripts/ensure-macos-keychain.sh"
  SIGNED_COUNT=0
  while IFS= read -r -d '' f; do
    if file -b "$f" | grep -q '^Mach-O'; then
      codesign --force --sign "$CSC_NAME" --keychain "$CSC_KEYCHAIN" \
        --options runtime --timestamp "$f"
      SIGNED_COUNT=$((SIGNED_COUNT + 1))
    fi
  done < <(find "$SRC" -type f -print0)
  log "闭包预签完成：$SIGNED_COUNT 个 Mach-O"
fi

# 5) 封盘：tar 排除源码/测试/文档/CI 配置/桌面端自身；node_modules 保留
#    symlink 结构（pnpm 相对链接，同构解压后仍有效）
log "打包 qilin-runtime.tar.gz"
BUNDLE="$STAGING/qilin-runtime.tar.gz"
rm -f "$BUNDLE"
# 排除模式按 bsdtar glob（* 跨目录段）：源码/测试/文档只清 apps|packages 域，
# node_modules 内不做内容筛选（个别包 main 指 src，保守保留）
tar -czf "$BUNDLE" -C "$SRC" \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='.agents' \
  --exclude='desktop' \
  --exclude='snapshots' \
  --exclude='docs' \
  --exclude='apps/*/src' \
  --exclude='apps/web/tests' \
  --exclude='packages/*/src' \
  --exclude='packages/*/tests' \
  --exclude='packages/*/*/src' \
  --exclude='packages/*/*/tests' \
  --exclude='*.md' \
  --exclude='node_modules/.cache' \
  --exclude='*.tsbuildinfo' \
  .
SHA256="$(shasum -a 256 "$BUNDLE" | awk '{print $1}')"
git -C "$SRC" checkout -- package.json 2>/dev/null || true

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
