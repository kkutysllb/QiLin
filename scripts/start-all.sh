#!/usr/bin/env bash
# 一键管理: QiLin gateway (28081) + web-demo (28080)
#
# Usage:
#   ./scripts/start-all.sh              # 启动(gateway 后台 + web-demo 前台, Ctrl+C 仅退前端)
#   ./scripts/start-all.sh start        # 同上
#   ./scripts/start-all.sh --stop       # 停止 gateway + web-demo
#   ./scripts/start-all.sh --status     # 查看两者运行状态
#   ./scripts/start-all.sh --restart    # 先停止, 再重新启动
#   ./scripts/start-all.sh --help       # 本帮助
#
# 端口可用环境变量覆盖: GATEWAY_PORT(默认 28081) / WEB_DEMO_PORT(默认 28080)
#
# 硬约束: 不影响本机已安装的 KWorks 应用 (19987/18569/~/.kworks)
#   停止时仅按 "本项目 PID 文件 + 端口监听 + 命令行特征/进程工作目录" 定位进程;
#   端口上的陌生进程只报告、绝不杀。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

GATEWAY_PORT="${GATEWAY_PORT:-28081}"
WEB_DEMO_PORT="${WEB_DEMO_PORT:-28080}"
WEB_PID_FILE="/tmp/qilin-web-demo.pid"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/start-all.sh              # 启动(gateway 后台 + web-demo 前台)
  ./scripts/start-all.sh start        # 同上
  ./scripts/start-all.sh --stop       # 停止 gateway + web-demo
  ./scripts/start-all.sh --status     # 查看运行状态
  ./scripts/start-all.sh --restart    # 停止后重新启动
  ./scripts/start-all.sh --help       # 本帮助

端口可用环境变量覆盖: GATEWAY_PORT(默认 28081) / WEB_DEMO_PORT(默认 28080)
EOF
}

# ── 参数解析(未识别参数直接报错退出, 绝不静默当作启动) ────────────────
MODE="start"
while [[ $# -gt 0 ]]; do
  case "$1" in
    start|--start)      MODE="start"; shift ;;
    --stop|stop)        MODE="stop"; shift ;;
    --status|status|-s) MODE="status"; shift ;;
    --restart|restart)  MODE="restart"; shift ;;
    --help|-h)          usage; exit 0 ;;
    *)                  echo "❌ 未知参数: $1"; echo; usage; exit 1 ;;
  esac
done

# ── 进程定位辅助(只认本项目特征, 避免误杀) ───────────────────────────
is_web_demo_pid() {
  local pid="$1"
  local cmd cwd
  # 特征一(主): 命令行含 node...server.js
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$cmd" == *node*server.js* ]]; then
    return 0
  fi
  # 特征二(兜底): 进程工作目录位于本项目 web-demo 下。
  # 受限执行环境可能拒绝 /bin/ps(读到空命令行), 此时用 lsof 读 cwd 判定归属。
  # 注意: -Fn 行以 n 开头输出路径, 需 sed -n 只保留替换行;
  # cwd 可能恰好是目录本身(无尾斜杠), 故给取到的路径补 / 再做前缀比对。
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | tail -1)"
  [[ "$cwd"/ == "$PROJECT_ROOT/web-demo/"* ]]
}

web_pids_on_port() {
  local pid
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    is_web_demo_pid "$pid" && echo "$pid"
  done < <(lsof -nP -iTCP:"$WEB_DEMO_PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  return 0   # 循环体最后一条命令可能返回 1(不匹配), 显式归零避免 set -e 误杀
}

wait_port_free() {
  local port="$1" label="$2" i
  for i in $(seq 1 20); do
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  echo "❌ 端口 $port 仍被占用($label 未完全退出):"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
  return 1
}

stop_web_demo() {
  local stopped=0 pid
  # 1) PID 文件(start-all.sh 启动时写入)
  if [[ -f "$WEB_PID_FILE" ]]; then
    pid="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && is_web_demo_pid "$pid"; then
      kill "$pid" 2>/dev/null || true
      stopped=1
      echo "✓ web-demo (PID $pid) 已停止"
    fi
    rm -f "$WEB_PID_FILE"
  fi
  # 等待已 kill 的进程释放端口(最多 5s), 避免兜底扫描对垂死进程重复 kill/重复报消息
  if [[ "$stopped" -eq 1 ]]; then
    for _ in $(seq 1 10); do
      lsof -nP -iTCP:"$WEB_DEMO_PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.5
    done
  fi
  # 2) 端口兜底: PID 文件丢失(如机器重启/手动启动)时按端口 + 命令行特征定位
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" 2>/dev/null || true
    stopped=1
    echo "✓ web-demo (PID $pid, 端口 $WEB_DEMO_PORT) 已停止"
  done < <(web_pids_on_port)
  if [[ "$stopped" -eq 0 ]]; then
    echo "⚠ 没有运行中的 web-demo"
    return 0
  fi
  wait_port_free "$WEB_DEMO_PORT" "web-demo"
}

status_web_demo() {
  local pids
  pids="$(web_pids_on_port | tr '\n' ' ')"
  if [[ -n "${pids// /}" ]]; then
    echo "✓ web-demo 在跑(PID ${pids})  http://localhost:$WEB_DEMO_PORT"
  else
    echo "⚠ web-demo 未运行"
  fi
}

stop_all() {
  "$SCRIPT_DIR/start-gateway.sh" --stop "$GATEWAY_PORT"
  stop_web_demo
}

# ── 子命令分发 ───────────────────────────────────────────────────────
case "$MODE" in
  stop)
    stop_all
    exit 0
    ;;
  status)
    "$SCRIPT_DIR/start-gateway.sh" --status "$GATEWAY_PORT"
    status_web_demo
    exit 0
    ;;
  restart)
    echo "── 停止现有进程 ──"
    stop_all || true
    echo ""
    ;;
esac

# ── 启动流程 ─────────────────────────────────────────────────────────
# 端口冲突检测: 只报错退出, 绝不杀进程
for P in "$GATEWAY_PORT" "$WEB_DEMO_PORT"; do
  if lsof -nP -iTCP:"$P" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ 端口 $P 已被占用:"
    lsof -nP -iTCP:"$P" -sTCP:LISTEN
    echo "提示: 先执行 ./scripts/start-all.sh --stop, 或换端口:"
    echo "      GATEWAY_PORT=28083 WEB_DEMO_PORT=28082 $0"
    exit 1
  fi
done

# 依赖检查:web-demo 缺少 node_modules 时按 lockfile 自动安装(关闭: QILIN_SKIP_AUTO_INSTALL=1)
# 网关侧(.venv 与 config.yaml)由 start-gateway.sh 负责自举。
if [[ ! -d web-demo/node_modules ]]; then
  if [[ -n "${QILIN_SKIP_AUTO_INSTALL:-}" ]]; then
    echo "❌ web-demo 未安装依赖: cd web-demo && pnpm install"
    exit 1
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "❌ web-demo 未安装依赖,且未找到 pnpm;请先 cd web-demo && pnpm install"
    exit 1
  fi
  echo "⚠ web-demo 未安装依赖,自动执行: cd web-demo && pnpm install --frozen-lockfile"
  ( cd web-demo && pnpm install --frozen-lockfile ) || {
    echo "❌ pnpm install 失败,请手动执行: cd web-demo && pnpm install"
    exit 1
  }
fi

# 启动 gateway (daemon, 复用 start-gateway.sh 的 token/CORS 逻辑)
"$SCRIPT_DIR/start-gateway.sh" --daemon "$GATEWAY_PORT"

# 等待 gateway 健康
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
  if [[ "$i" == "30" ]]; then
    echo "❌ gateway 30s 内未就绪: tail -f /tmp/qilin-gateway.log"
    exit 1
  fi
done
echo "✓ gateway healthy: http://127.0.0.1:${GATEWAY_PORT}/health"

# 启动 web-demo (前台; Ctrl+C 仅退出前端, gateway 保持 daemon)
export GATEWAY_TARGET_URL="http://127.0.0.1:${GATEWAY_PORT}"
export WEB_DEMO_PORT
echo "✓ web-demo   : http://localhost:${WEB_DEMO_PORT}"
echo "  (Ctrl+C 退出前端; 全部停止: $0 --stop)"
cd web-demo
echo $$ > "$WEB_PID_FILE"   # 供 --stop 使用(exec 后 PID 不变)
exec node server.js
