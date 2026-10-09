#!/usr/bin/env bash
# scripts/release.sh — 本地发版入口（M4，KStock build-release.sh 同款分层精简版）。
#
#   scripts/release.sh <version>    # 1.0.0 或 v1.0.0：门禁 → 打包 → 产物门 → tag → push
#   scripts/release.sh --status     # 只读总览
#
# 门禁链（本地即 CI 同源）：
#   npm test → build-desktop.sh（闭包封盘 + 打包）→ verify-desktop-artifacts.sh（V1–V7）
#
# 约定：release/<tag>.md 为 GitHub Release 正文（缺失 --allow-missing-notes 应急）；
# 版本单一事实源 = package.json（发版时同步写 package/package.json）。
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

STATUS_ONLY=false
ALLOW_MISSING_NOTES=false
NO_PUSH=false
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --status) STATUS_ONLY=true ;;
    --allow-missing-notes) ALLOW_MISSING_NOTES=true ;;
    --no-push) NO_PUSH=true ;;
    v[0-9]*|[0-9]*) VERSION="${arg#v}" ;;
    *) die "未知参数：$arg" ;;
  esac
done

if [ "$STATUS_ONLY" = true ]; then
  log "版本：$(node -p "require('$REPO_ROOT/package.json').version")"
  log "上游：$(node -p "const l=JSON.parse(require('fs').readFileSync('$REPO_ROOT/upstream/qilin.lock.json','utf8'));l.qilinVersion+' @ '+l.qilinCommit.slice(0,12)")"
  log "工作树：$(git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' ') 个未提交文件"
  log "闭包：$([ -f "$REPO_ROOT/staging/qilin-runtime.tar.gz" ] && echo "在位 ($(du -h "$REPO_ROOT/staging/qilin-runtime.tar.gz" | awk '{print $1}'))" || echo '未构建')"
  log "桌面包：$(ls "$REPO_ROOT/dist-exe" 2>/dev/null | grep -cE 'dmg|zip' || true) 个安装包"
  exit 0
fi

[ -n "$VERSION" ] || die "用法：scripts/release.sh <version>（或 --status）"
TAG="v$VERSION"
git -C "$REPO_ROOT" rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1 && die "本地 tag $TAG 已存在"
git -C "$REPO_ROOT" ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG" && die "远程 tag $TAG 已存在"

# 1) 版本单一事实源
log "版本 → $VERSION"
node -e '
const fs = require("fs")
for (const p of ["package.json", "package/package.json"]) {
  const m = JSON.parse(fs.readFileSync(p, "utf8"))
  m.version = process.argv[1]
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n")
}
' "$VERSION"

# 2) 发布说明（GitHub Release 正文）
if [ ! -f "$REPO_ROOT/release/$TAG.md" ] && [ "$ALLOW_MISSING_NOTES" = false ]; then
  die "缺 release/$TAG.md 发布说明（--allow-missing-notes 应急跳过）"
fi

# 3) 测试门
log "门禁：npm test"
npm test

# 4) 打包（闭包封盘 + builder）+ 产物门
log "打包：build-desktop.sh"
bash "$REPO_ROOT/scripts/build-desktop.sh"
log "产物门：verify-desktop-artifacts.sh"
bash "$REPO_ROOT/scripts/verify-desktop-artifacts.sh"

# 5) commit + tag + push（atomic：分支与 tag 一次推）
if git -C "$REPO_ROOT" status --porcelain | grep -q .; then
  git -C "$REPO_ROOT" add package.json package/package.json
  git -c user.name="$(git config user.name)" commit -m "release: $TAG" --no-verify 2>/dev/null || true
  git -C "$REPO_ROOT" add -A
  git -C "$REPO_ROOT" commit -m "release: $TAG（产物与文档随发版落位）" || true
fi
git -C "$REPO_ROOT" tag -a "$TAG" -m "QiLin Desktop $TAG"
if [ "$NO_PUSH" = false ]; then
  log "推送 $TAG（atomic：main + tag）"
  git -C "$REPO_ROOT" push origin main "$TAG"
  log "CI 已触发（release.yml）：gh run watch --exit-status 或到 Actions 页查看"
else
  log "本地 commit/tag 已就绪（--no-push：git push origin main $TAG 手动推）"
fi
