#!/usr/bin/env bash
# 一键启动 QiLin Web Demo(Next.js dev server)
#
# Usage:
#   ./scripts/start-web-demo.sh                # 前台运行(默认端口 3000;3000 被占则 3001)
#   ./scripts/start-web-demo.sh --daemon       # 后台运行(PID 写到 /tmp/qilin-web-demo.pid)
#   ./scripts/start-web-demo.sh --stop         # 停掉后台运行的 web-demo
#   ./scripts/start-web-demo.sh --status       # 查看 web-demo 状态
#   ./scripts/start-web-demo.sh --restart      # 停 + 重启
#   GATEWAY_BASE_URL=http://127.0.0.1:8082 ./scripts/start-web-demo.sh
#
# 日志:    /tmp/web-demo-dev.log
# PID 文件: /tmp/qilin-web-demo.pid

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DEMO_DIR="$PROJECT_ROOT/web-demo"
PID_FILE="/tmp/qilin-web-demo.pid"
LOG_FILE="/tmp/web-demo-dev.log"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# 解析参数
MODE="foreground"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --daemon|-d) MODE="daemon"; shift ;;
    --stop)      MODE="stop"; shift ;;
    --status|-s) MODE="status"; shift ;;
    --restart|-r) MODE="restart"; shift ;;
    --help|-h)
      sed -n '2,15p' "$0"; exit 0 ;;
    *)           echo -e "${RED}未知参数: $1${NC}"; exit 1 ;;
  esac
done

if [[ ! -d "$WEB_DEMO_DIR" ]]; then
  echo -e "${RED}❌ $WEB_DEMO_DIR 不存在${NC}"
  exit 1
fi

# ── status ────────────────────────────────────────────────────────
if [[ "$MODE" == "status" ]]; then
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    PID="$(cat "$PID_FILE")"
    echo -e "${GREEN}✓ Web Demo 在跑(PID $PID)${NC}"
    # Next.js dev server fork 子进程监听端口,父 PID 不直接 LISTEN。
    # 扫描 3000-3010 找出实际端口(本机只跑一个 web-demo)
    PORT=$(lsof -nP -iTCP:3000-3010 -sTCP:LISTEN 2>/dev/null | awk '/LISTEN/{print $9}' | sed -E 's/.*://' | sort -u | head -1)
    if [[ -n "$PORT" ]]; then
      echo "   URL:  http://localhost:$PORT"
    else
      echo "   URL:  http://localhost:3000 (未检测到端口,可能还在启动)"
    fi
    echo -e "   日志: ${CYAN}tail -f $LOG_FILE${NC}"
  else
    echo -e "${YELLOW}⚠ Web Demo 未运行${NC}"
  fi
  exit 0
fi

# ── stop ──────────────────────────────────────────────────────────
if [[ "$MODE" == "stop" ]]; then
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    PID="$(cat "$PID_FILE")"
    echo -e "${YELLOW}⏹ 停止 Web Demo(PID $PID)...${NC}"
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo -e "${GREEN}✓ 已停止${NC}"
  else
    echo -e "${YELLOW}⚠ 未运行,无需停止${NC}"
    rm -f "$PID_FILE"
  fi
  exit 0
fi

# ── restart ───────────────────────────────────────────────────────
if [[ "$MODE" == "restart" ]]; then
  "$0" --stop || true
  sleep 1
  exec "$0" --daemon
fi

# ── 前置检查 ──────────────────────────────────────────────────────
cd "$WEB_DEMO_DIR"

# 检查 node_modules
if [[ ! -d "$WEB_DEMO_DIR/node_modules" ]]; then
  echo -e "${YELLOW}⚠ node_modules 不存在,先 pnpm install${NC}"
  pnpm install
fi

# 默认配置
export GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://127.0.0.1:8081}"
export NEXT_PUBLIC_APP_NAME="${NEXT_PUBLIC_APP_NAME:-QiLin Demo}"

# ── daemon 模式 ──────────────────────────────────────────────────
if [[ "$MODE" == "daemon" ]]; then
  echo -e "${GREEN}🚀 后台启动 QiLin Web Demo${NC}"
  echo "   Gateway:  $GATEWAY_BASE_URL"
  echo "   日志:     $LOG_FILE"
  echo "   PID 文件: $PID_FILE"
  echo ""

  # 如果已经在跑,提示
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo -e "${YELLOW}⚠ 已在跑(PID $(cat "$PID_FILE")),用 --restart 重启${NC}"
    exit 0
  fi

  # 启动
  nohup pnpm dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 3
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    PID="$(cat "$PID_FILE")"
    PORT=$(lsof -nP -iTCP:3000-3010 -sTCP:LISTEN 2>/dev/null | awk '/LISTEN/{print $9}' | sed -E 's/.*://' | sort -u | head -1)
    echo -e "${GREEN}✓ 启动成功(PID $PID)${NC}"
    [[ -n "$PORT" ]] && echo -e "   URL:  ${CYAN}http://localhost:$PORT${NC}"
    echo ""
    echo -e "查看日志: ${CYAN}tail -f $LOG_FILE${NC}"
    echo -e "停止服务: ${CYAN}$0 --stop${NC}"
    echo -e "查看状态: ${CYAN}$0 --status${NC}"
  else
    echo -e "${RED}❌ 启动失败,请查看日志: $LOG_FILE${NC}"
    tail -20 "$LOG_FILE"
    exit 1
  fi
  exit 0
fi

# ── 前台模式(默认) ───────────────────────────────────────────────
echo -e "${GREEN}🚀 启动 QiLin Web Demo(前台)${NC}"
echo "   Gateway: $GATEWAY_BASE_URL"
echo "   停止:    Ctrl+C"
echo ""

exec pnpm dev