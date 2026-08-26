#!/usr/bin/env bash
# 一键启动 QiLin 完整开发环境(gateway + web-demo)
#
# Usage:
#   ./scripts/start-all.sh                # 后台起 gateway + web-demo
#   ./scripts/start-all.sh --stop         # 停两个
#   ./scripts/start-all.sh --status       # 看状态
#   ./scripts/start-all.sh --restart      # 全停重启
#   ./scripts/start-all.sh --logs         # 同时 tail 两个日志
#   ./scripts/start-all.sh --fg           # 前台起(Ctrl+C 全停)— 用于调试
#
# 端口:
#   - Gateway:  8081(默认,可用 GATEWAY_PORT 覆盖)
#   - Web Demo: 3000(Next.js 自动选可用端口)
#
# 日志:
#   - /tmp/qilin-gateway.log
#   - /tmp/web-demo-dev.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop)
      echo -e "${BOLD}═══ 停止 Gateway ═══${NC}"
      "$SCRIPT_DIR/start-gateway.sh" --stop || true
      echo ""
      echo -e "${BOLD}═══ 停止 Web Demo ═══${NC}"
      "$SCRIPT_DIR/start-web-demo.sh" --stop || true
      exit 0
      ;;
    --status|-s)
      echo -e "${BOLD}═══ Gateway ═══${NC}"
      "$SCRIPT_DIR/start-gateway.sh" --status
      echo ""
      echo -e "${BOLD}═══ Web Demo ═══${NC}"
      "$SCRIPT_DIR/start-web-demo.sh" --status
      exit 0
      ;;
    --restart|-r)
      "$SCRIPT_DIR/start-all.sh" --stop || true
      sleep 1
      exec "$0"
      ;;
    --logs)
      tail -F /tmp/qilin-gateway.log /tmp/web-demo-dev.log 2>/dev/null
      exit 0
      ;;
    --fg)
      MODE="fg"
      shift
      ;;
    --help|-h)
      sed -n '2,17p' "$0"; exit 0 ;;
    *)
      echo -e "${RED}未知参数: $1${NC}"
      exit 1
      ;;
  esac
done

# 默认:后台启动两个
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   QiLin Dev Stack — Gateway + Web Demo            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. 启动 Gateway(已在跑则跳过)
echo -e "${BOLD}[1/2]${NC} Gateway..."
if [[ -f /tmp/qilin-gateway.pid ]] && kill -0 "$(cat /tmp/qilin-gateway.pid)" 2>/dev/null; then
  echo -e "  ${YELLOW}已在跑(PID $(cat /tmp/qilin-gateway.pid))${NC} — 跳过"
else
  "$SCRIPT_DIR/start-gateway.sh" --daemon || {
    echo -e "${RED}❌ Gateway 启动失败,继续启动 web-demo? (y/N)${NC}"
    read -r ans
    [[ "$ans" != "y" ]] && exit 1
  }
fi
echo ""

# 2. 启动 Web Demo(已在跑则跳过)
echo -e "${BOLD}[2/2]${NC} Web Demo..."
if [[ -f /tmp/qilin-web-demo.pid ]] && kill -0 "$(cat /tmp/qilin-web-demo.pid)" 2>/dev/null; then
  echo -e "  ${YELLOW}已在跑(PID $(cat /tmp/qilin-web-demo.pid))${NC} — 跳过"
else
  "$SCRIPT_DIR/start-web-demo.sh" --daemon || {
    echo -e "${RED}❌ Web Demo 启动失败${NC}"
    exit 1
  }
fi
echo ""

# 3. 总结
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ 全部启动完成${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Gateway  :  ${CYAN}http://127.0.0.1:${GATEWAY_PORT:-8081}${NC}"
echo -e "  Web Demo :  ${CYAN}http://localhost:3000${NC} (或 3001)"
echo ""
echo -e "  ${BOLD}查看状态${NC}: ${CYAN}$0 --status${NC}"
echo -e "  ${BOLD}查看日志${NC}: ${CYAN}$0 --logs${NC}    (gateway + web-demo 双 tail)"
echo -e "  ${BOLD}停止全部${NC}: ${CYAN}$0 --stop${NC}"
echo -e "  ${BOLD}重启全部${NC}: ${CYAN}$0 --restart${NC}"
echo ""
echo -e "  ${YELLOW}默认账号${NC}: admin@example.com / AdminPass2024!secure"