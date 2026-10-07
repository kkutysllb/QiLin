#!/usr/bin/env bash
# scripts/verify-desktop-artifacts.sh — 桌面包产物门禁电池（V1–V7，KStock 同款
# 硬门语义：任一失败 exit 1，发布链在产物层拦截）。
#
# 用法：bash scripts/verify-desktop-artifacts.sh [dist 目录，缺省 dist-exe]
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
DIST="${1:-$REPO_ROOT/dist-exe}"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*"; FAIL=$((FAIL + 1)); }
FAIL=0

[ -d "$DIST" ] || { echo "ERROR: 产物目录不存在 $DIST" >&2; exit 1; }
log "产物门禁：$DIST"

# V1 安装包在位（dmg 或 zip 至少其一，arm64 形态）
DMG="$(ls "$DIST"/*-arm64.dmg 2>/dev/null | head -1 || true)"
ZIP="$(ls "$DIST"/*.zip 2>/dev/null | grep -v blockmap | head -1 || true)"
{ [ -n "$DMG" ] || [ -n "$ZIP" ]; } && pass "V1 安装包在位（dmg: ${DMG:+✓} zip: ${ZIP:+✓}）" || fail "V1 缺 dmg/zip 安装包"

# V2 更新元数据齐全（latest-mac.yml + 对应 blockmap）
LM="$DIST/latest-mac.yml"
[ -f "$LM" ] && pass "V2 latest-mac.yml 在位" || fail "V2 缺 latest-mac.yml（electron-updater feed）"
BLOCKMAPS="$(ls "$DIST"/*.blockmap 2>/dev/null | wc -l | tr -d ' ')"
[ "${BLOCKMAPS:-0}" -ge 1 ] && pass "V2 blockmap 增量文件 x$BLOCKMAPS" || fail "V2 缺 blockmap（增量更新不可用）"

# V3 更新元数据与安装包交叉引用（yml 内 url/文件名必须在产物集中）
if [ -f "$LM" ]; then
  OK=true
  while IFS= read -r fname; do
    [ -f "$DIST/$fname" ] || { OK=false; fail "V3 latest-mac.yml 引用缺失：$fname"; }
  done < <(node -e 'const y=require("fs").readFileSync(process.argv[1],"utf8");for(const m of y.matchAll(/url:\s*(\S+)/g))console.log(decodeURIComponent(m[1].split("/").pop()))' "$LM")
  [ "$OK" = true ] && pass "V3 latest-mac.yml 引用与产物交叉一致"
fi

# V4 封盘清单与闭包 sha256 一致（打包契约：runtime 进包前未被篡改）
if [ -f "$REPO_ROOT/staging/desktop-runtime.json" ] && [ -f "$REPO_ROOT/staging/qilin-runtime.tar.gz" ]; then
  EXPECT="$(node -p "JSON.parse(require('fs').readFileSync('$REPO_ROOT/staging/desktop-runtime.json','utf8')).sha256")"
  ACTUAL="$(shasum -a 256 "$REPO_ROOT/staging/qilin-runtime.tar.gz" | awk '{print $1}')"
  [ "$EXPECT" = "$ACTUAL" ] && pass "V4 运行时闭包 sha256 与清单一致" || fail "V4 闭包 sha256 不符（清单失真）"
else
  fail "V4 staging 缺闭包/清单（build-desktop.sh 完整链应保留 staging）"
fi

# V5 dmg 完整性（hdiutil verify；CI headless 亦可跑）
if [ -n "${DMG:-}" ]; then
  if hdiutil verify "$DMG" >/dev/null 2>&1; then
    pass "V5 dmg 结构校验通过（hdiutil verify）"
  else
    fail "V5 dmg 校验失败"
  fi
fi

# V6 版本一致性（包版本 = 仓库产品版本 = latest-mac.yml 版本）
ROOT_VER="$(node -p "JSON.parse(require('fs').readFileSync('$REPO_ROOT/package.json','utf8')).version")"
PKG_VER="$(node -p "JSON.parse(require('fs').readFileSync('$REPO_ROOT/desktop/package/package.json','utf8')).version")"
YML_VER="$(node -e 'const y=require("fs").readFileSync(process.argv[1],"utf8");const m=/version:\s*(\S+)/.exec(y);console.log(m?m[1]:"")' "$LM" 2>/dev/null || true)"
if [ "$ROOT_VER" = "$PKG_VER" ] && { [ -z "$YML_VER" ] || [ "$YML_VER" = "$ROOT_VER" ]; }; then
  pass "V6 版本一致性 ${ROOT_VER}（根 = 打包域 = latest-mac.yml）"
else
  fail "V6 版本不一致：根 $ROOT_VER / 打包域 $PKG_VER / yml ${YML_VER:-?}"
fi

# V7 闭包入口冒烟（解压 tar 到临时目录，验证宿主 boot 模块与 web dist 在位）
SMOKE="$(mktemp -d)"
tar -xzf "$REPO_ROOT/staging/qilin-runtime.tar.gz" -C "$SMOKE" 2>/dev/null
{ [ -f "$SMOKE/apps/cli/lib/profile-boot.js" ] && [ -f "$SMOKE/apps/web/dist/index.html" ]; } \
  && pass "V7 闭包冒烟：宿主 boot 模块 + web dist 在位" \
  || fail "V7 闭包缺关键入口（封盘排除规则误伤）"
rm -rf "$SMOKE"

if [ "$FAIL" -gt 0 ]; then
  echo "产物门禁：$FAIL 项失败" >&2
  exit 1
fi
log "产物门禁全部通过"
