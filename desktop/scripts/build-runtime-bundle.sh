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
# Windows（Git Bash / MSYS）下 pwd 是 /d/a/... 形态，交给 Node 会被解析成多一层
# 盘符的绝对路径（2026-10-13 CI 现场：Windows 封盘死在 readFileSync 读 package.json
# 这一行）。pwd -W 取原生形态（D:/a/...，bash / git / node 三边都认）；该开关在
# macOS/Linux 的 pwd 上不存在，直接回落到普通 pwd——两平台行为与改动前完全一致。
REPO_ROOT="$(pwd -W 2>/dev/null || pwd)"
ENGINE_ROOT="$(cd "$REPO_ROOT/.." && (pwd -W 2>/dev/null || pwd))"
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
# Windows 闭包必须**无 symlink**：Windows 解包/建链需要 SeCreateSymbolicLinkPrivilege
# （CI 与普通用户机器都没有），带链接的归档在 CI 解包与用户首启解压时都会丢文件
# （2026-10-13 现场：bsdtar 解包 6200+ symlink 直接失败）。
# 布局选择（2026-10-14 第 10 轮本地实证，两条都验过）：
#  · `--config.symlink=false` **不可用**：它不是「把链接换成拷贝」，而是**根本不建
#    workspace 链接**——实测 apps/cli/node_modules 整个不存在、根 node_modules 的
#    @qilin-agent/* 为 0 条 ⇒ 引擎 bin.js 首个 import 即
#    ERR_MODULE_NOT_FOUND('@qilin-agent/app-boot')（第 9 轮 Windows 现场即此）。
#  · `node-linker=hoisted`（默认，含 workspace 链接）+ 下方**零链接化**步：
#    hoisted 把外部依赖摊成根 node_modules 真目录，链接图**平坦无环**（实测 921 条 /
#    最深 8 层 / 仅 3 条嵌套），因此可以安全地「摊平到根 + 清链接」。
# 仅 Windows 走 hoisted；mac/Linux 保持已验证的隔离布局（解包侧有链接特权）。
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) PROD_LINKER="--config.node-linker=hoisted" ;;
  *) PROD_LINKER="" ;;
esac
(cd "$SRC" && rm -rf node_modules && CI=true pnpm install --prod $PROD_LINKER)

# 悬挂链接剪枝：--prod 只清**根** node_modules；全量安装期在各包自己的
# node_modules 里留下的 per-package 依赖链接（react/@types/react/clsx 等 dev
# 依赖），剪枝后目标已不存在——成为闭包里的**死链接**。mac/Linux 解包容忍
# 悬挂链接（所以前几轮一路绿），Windows 的 tar 创建不了符号链接，逐条
# 「Cannot create symlink … No such file or directory」整步红（2026-10-14 CI
# 现场）。只删「解析不到」的链接，活链接（workspace 真实依赖）一律不动。
find "$SRC" -type l | while IFS= read -r l; do
  [ -e "$l" ] || rm -f -- "$l"
done
log "悬挂链接剪枝完成：闭包内不再有解析不到的符号链接"

# 零链接化（**仅 Windows**）：hoisted 布局的链接图平坦无环，可安全摊平——
#   ① 每个链接目标按「最后一个 node_modules/ 之后的包名」拷成根 node_modules 真目录；
#   ② 文件链接（.bin 垫片等）就地实体化；③ 删除全部残余链接 ⇒ 归档零符号链接。
# Node 解析语义保证：包内解析先查自身 node_modules（已空），逐级上溯到根即命中真目录。
# 本地实测：921 条链接 → 0 条；根 @qilin-agent/app-boot 为真目录；真解析器
# （import.meta.resolve）从 apps/cli 可解析 app-boot / home-paths / kylin-plugin-loader；
# 体积 +7%（886M→951M）。
# 反例留档（勿再试）：tar -h 与 cp -RL 都会在**隔离布局**的成环链接图上爆炸
# （第 10 轮现场：cp 报 directory causes a cycle / File name too long / cannot copy
# a directory into itself，macOS 封盘步 60 分钟超时）；cp -R（不解引用）会把相对
# 链接拷成悬空（实测 919 条 → 1231 条悬空，体积 +270M）——拷贝语义跨目录失效。
zero_link_windows() {
  local src="$1" root="$1/node_modules" rel t n=0 f=0 d=0 left=0
  mkdir -p "$root"
  while IFS= read -r -d '' l; do
    case "$l" in */node_modules/.bin/*) continue ;; esac
    rel="${l##*node_modules/}"
    [ "$rel" = "$l" ] && continue
    case "$rel" in .*|*/node_modules/*) continue ;; esac
    t="$(readlink -f -- "$l" 2>/dev/null || true)"
    [ -n "$t" ] && [ -e "$t" ] || continue
    [ -e "$root/$rel" ] && continue
    mkdir -p "$root/$rel"
    if [ -d "$t" ]; then
      # 拷贝时**排除 node_modules**：目标包自带的 per-package node_modules 只装链接，
      # 而 Windows 的 cp 遇到链接会直接失败（第 11 轮现场：cannot create symbolic
      # link .../accounts-local/node_modules/...）。实测全树 node_modules 之外零链接
      # ⇒ 排除后拷贝不可能再重建任何符号链接（这是构造性保证，不是概率）。
      for entry in "$t"/* "$t"/.[!.]*; do
        [ -e "$entry" ] || continue
        base="${entry##*/}"
        [ "$base" = "node_modules" ] && continue
        cp -R -- "$entry" "$root/$rel/$base"
      done
    else
      cp -pL -- "$t" "$root/$rel"
    fi
    n=$((n+1))
  done < <(find "$src" -type l -print0)
  while IFS= read -r -d '' l; do
    t="$(readlink -f -- "$l" 2>/dev/null || true)"
    if [ -n "$t" ] && [ -f "$t" ]; then rm -f -- "$l"; cp -pL -- "$t" "$l" 2>/dev/null || true; f=$((f+1)); fi
  done < <(find "$src" -type l -print0)
  # 删除链接只用 rm -f（= unlink，绝不递归）：MSYS 把 junction 视作链接，rm -rf 在
  # 某些语义下会删进目标目录，那是灾难性的——宁可留下残余由下方断言拦下。
  while IFS= read -r -d '' l; do rm -f -- "$l" 2>/dev/null || true; d=$((d+1)); done < <(find "$src" -type l -print0)
  left="$(find "$src" -type l | wc -l | tr -d ' ')"
  log "零链接化：摊平 $n 条、文件链接实体化 $f 条、清除残余链接 $d 条 ⇒ 剩余 $left 条"
  [ "$left" -eq 0 ] || die "零链接化失败：归档仍含 $left 条符号链接（Windows 解包会丢文件）"
}
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) zero_link_windows "$SRC" ;; esac

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
# **排除必须与链接剪枝同口径**：上方剪枝只删「worktree 内解析不到」的链接，
# 而排除清单会在归档里制造新的悬空——.claude/skills → 被排除的 .agents/skills、
# apps/cli/tests 夹具 → 被排除的 snapshots/（2026-10-14 Windows 现场：Git Bash
# tar 无符号链接特权，逐条 Cannot create symlink 整步红；mac/Linux 解包容忍悬空
# 所以一路绿）。.claude 与 apps/*/tests 两条排除就是把这两类链接整个清出归档；
# 归档终局由宿主仓 verify 步的「解包后零悬空链接」断言把关。
# *.map / *.d.ts 对齐 dsh 封盘口径（materialize-peers 时代的既定动作）：二者是纯
# 开发产物，运行时永不解析（lib/types/ 下的编译型 .js 不受影响，只有声明与
# sourcemap 被排除）。2026-10-14 实测闭包 58,490 条里 .map 占 10,864、.d.ts 占
# 9,547——合计 35%；解包条目数直接决定 Windows 首启/CI 的落盘耗时，必须对齐。
# tar 的 -C 用 POSIX 形态：MSYS 的 GNU tar 把「盘符+冒号」当**远程主机**
# （现场：`tar (child): Cannot connect to D: resolve failed`），而 Node/ git 要的是
# 原生形态（见上方 REPO_ROOT）。cygpath 只在 Windows/MSYS 存在，其余平台原样传。
if command -v cygpath >/dev/null 2>&1; then SRC_TAR="$(cygpath -u "$SRC")"; else SRC_TAR="$SRC"; fi
# 归档名也不能带盘符冒号（第二处同类坑：-f 的 D:/... 同样被 MSYS tar 当成远程
# 主机，报 Cannot connect to D:）。进 staging 目录用相对文件名写归档；
# Node / shasum 侧继续用原生 BUNDLE 路径（它们认原生形态）。
# （-h 解引用方案已弃：目录符号链接会被整树复制，tar 直接超时。2026-10-14 第 10
# 轮用 cp -RL 物化步二次证伪并给出**机制**：pnpm 的 per-package node_modules
# 链接图**成环**（现场：subagent-acp → … → kylin → … 回卷，cp 报
# 「directory causes a cycle」/「File name too long」，Linux 报
# 「cannot copy a directory into itself」）⇒ 解引用/整树拷贝类方案在此图上
# 原理性不可行，别再试第三次。无链接化只能由安装布局保证。）
( cd "$STAGING" && tar -czf qilin-runtime.tar.gz -C "$SRC_TAR" \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='.agents' \
  --exclude='.claude' \
  --exclude='desktop' \
  --exclude='snapshots' \
  --exclude='docs' \
  --exclude='apps/*/src' \
  --exclude='apps/*/tests' \
  --exclude='packages/*/src' \
  --exclude='packages/*/tests' \
  --exclude='packages/*/*/src' \
  --exclude='packages/*/*/tests' \
  --exclude='*.md' \
  --exclude='node_modules/.cache' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.map' \
  --exclude='*.d.ts' \
  . )
# shasum 在 Windows 的 Git Bash 里不存在（2026-10-13 CI 现场：command not found）。
# 统一用 node crypto 流式计算——三平台都必有 node（本脚本前文已在用）。
SHA256="$(node -e 'const c=require("crypto"),f=require("fs");const h=c.createHash("sha256");f.createReadStream(process.argv[1]).on("data",(d)=>h.update(d)).on("end",()=>process.stdout.write(h.digest("hex")))' "$BUNDLE")"
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
