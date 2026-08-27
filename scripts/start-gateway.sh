#!/usr/bin/env bash
# 一键启动 QiLin Gateway(自动配置 internal auth token + CORS + 端口检测)
#
# Usage:
#   ./scripts/start-gateway.sh              # 前台运行(默认端口 28081)
#   ./scripts/start-gateway.sh 28083        # 前台,自定义端口
#   ./scripts/start-gateway.sh --daemon     # 后台(用 nohup 脱离 session),默认端口
#   ./scripts/start-gateway.sh --daemon 28083
#   ./scripts/start-gateway.sh --stop       # 停掉后台运行的 gateway(PID 文件丢失时按端口+命令行兜底)
#   ./scripts/start-gateway.sh --stop 28083 # 停掉自定义端口上的 gateway
#   ./scripts/start-gateway.sh --status     # 查看 gateway 状态
#
# 依赖:
#   - uvicorn in PATH(或 miniconda 的 uvicorn)
#   - python3(用于生成 secret)

set -euo pipefail

# 解析参数
MODE="foreground"
PORT="28081"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --daemon|-d) MODE="daemon"; shift ;;
    --stop)      MODE="stop"; shift ;;
    --status|-s) MODE="status"; shift ;;
    --help|-h)
      sed -n '2,12p' "$0"; exit 0 ;;
    [0-9]*)      PORT="$1"; shift ;;
    *)           echo "未知参数: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
LOG_FILE="/tmp/qilin-gateway.log"
PID_FILE="/tmp/qilin-gateway.pid"

# 加载本地 .env(如 MINIMAX_API_KEY 等被 config.yaml 以 $VAR 引用的密钥;不存在则跳过)
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── stop / status 子命令 ─────────────────────────────────────────────
if [[ "$MODE" == "stop" ]]; then
  STOPPED=0
  if [[ -f "$PID_FILE" ]]; then
    PID="$(cat "$PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      echo -e "${GREEN}✓ Gateway (PID $PID) 已停止${NC}"
      STOPPED=1
    else
      echo -e "${YELLOW}⚠ PID $PID 不存在,清理 PID 文件${NC}"
    fi
    rm -f "$PID_FILE"
  fi
  # 等待已 kill 的进程释放端口(最多 5s), 避免兜底扫描对垂死进程重复 kill/重复报消息
  if [[ "$STOPPED" -eq 1 ]]; then
    for _ in $(seq 1 10); do
      lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.5
    done
  fi
  # 端口兜底: PID 文件丢失(如机器重启后残留进程)时, 按端口监听 + 身份特征定位:
  # 命令行匹配 uvicorn/app.gateway.app, 或进程 cwd 位于本项目内(ps 被受限环境
  # 静默拒绝时的第二判据)。两者皆不匹配的陌生占用者只报告、绝不杀。
  while IFS= read -r PID; do
    [[ -z "$PID" ]] && continue
    CMD="$(ps -p "$PID" -o command= 2>/dev/null || true)"
    CWD="$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | tail -1)"
    if echo "$CMD" | grep -qE "uvicorn|app\.gateway\.app" \
       || [[ "$CWD"/ == "$PROJECT_ROOT/"* ]]; then
      kill "$PID" 2>/dev/null || true
      echo -e "${GREEN}✓ Gateway (PID $PID, 端口 $PORT) 已停止${NC}"
      STOPPED=1
    else
      echo -e "${YELLOW}⚠ 端口 $PORT 被 PID $PID 占用但非 gateway 进程, 不处理:${NC}"
      echo "    $CMD"
    fi
  done < <(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ "$STOPPED" -eq 0 ]]; then
    echo -e "${YELLOW}⚠ 没有运行中的 gateway${NC}"
  fi
  exit 0
fi

if [[ "$MODE" == "status" ]]; then
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    PID="$(cat "$PID_FILE")"
    echo -e "${GREEN}✓ Gateway 在跑(PID $PID)${NC}"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -3
    echo ""
    echo -e "日志: ${CYAN}tail -f $LOG_FILE${NC}"
  else
    echo -e "${YELLOW}⚠ Gateway 未运行${NC}"
  fi
  exit 0
fi

# ── 通用前置检查 ─────────────────────────────────────────────────────
# 检查端口冲突
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo -e "${RED}❌ 端口 $PORT 已被占用:${NC}"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN
  echo ""
  echo -e "${YELLOW}提示:${NC} 换一个端口: $0 --daemon 28083"
  echo "       或停掉占用: $0 --stop"
  exit 1
fi

# 检查 internal auth token
if [[ -z "${QILIN_INTERNAL_AUTH_TOKEN:-}" ]]; then
  if [[ -f .qilin-internal-token ]]; then
    export QILIN_INTERNAL_AUTH_TOKEN="$(cat .qilin-internal-token)"
    echo -e "${YELLOW}⚠ 从 .qilin-internal-token 加载 secret${NC}"
  else
    echo -e "${YELLOW}⚠ QILIN_INTERNAL_AUTH_TOKEN 未设置,自动生成新 secret${NC}"
    export QILIN_INTERNAL_AUTH_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    echo "$QILIN_INTERNAL_AUTH_TOKEN" > .qilin-internal-token
    echo -e "${GREEN}✓ 已持久化到 .qilin-internal-token(下次自动加载)${NC}"
  fi
fi

# 检查 config.yaml
if [[ ! -f config.yaml ]]; then
  echo -e "${RED}❌ config.yaml 不存在${NC}"
  echo "   请先 cp config.example.yaml config.yaml 并按需修改"
  exit 1
fi

# CORS:默认放行本地 web-demo 端口(可被环境变量覆盖)
# Gateway 的 CORS middleware 是 opt-in:不设置 GATEWAY_CORS_ORIGINS 就根本不挂载
export GATEWAY_CORS_ORIGINS="${GATEWAY_CORS_ORIGINS:-http://localhost:28080,http://127.0.0.1:28080,http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,app://-,tauri://localhost}"

# 找到 uvicorn
UVICORN_BIN="${UVICORN_BIN:-uvicorn}"
if ! command -v "$UVICORN_BIN" >/dev/null 2>&1; then
  if [[ -x /Users/libing/miniconda3/bin/uvicorn ]]; then
    UVICORN_BIN="/Users/libing/miniconda3/bin/uvicorn"
  else
    echo -e "${RED}❌ uvicorn 不在 PATH,也无法找到 /Users/libing/miniconda3/bin/uvicorn${NC}"
    exit 1
  fi
fi

# ── daemon 模式 ──────────────────────────────────────────────────────
if [[ "$MODE" == "daemon" ]]; then
  echo -e "${GREEN}🚀 后台启动 QiLin Gateway${NC}"
  echo "   端口:   $PORT"
  echo "   日志:   $LOG_FILE"
  echo "   PID:    $PID_FILE"
  echo "   Secret: $(echo "$QILIN_INTERNAL_AUTH_TOKEN" | head -c 12)..."
  echo ""
  nohup "$UVICORN_BIN" app.gateway.app:app \
    --port "$PORT" \
    --host 127.0.0.1 \
    --no-access-log \
    > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 2
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo -e "${GREEN}✓ 启动成功(PID $(cat "$PID_FILE"))${NC}"
    echo ""
    echo -e "查看日志: ${CYAN}tail -f $LOG_FILE${NC}"
    echo -e "停止服务: ${CYAN}$0 --stop${NC}"
    echo -e "查看状态: ${CYAN}$0 --status${NC}"
  else
    echo -e "${RED}❌ 启动失败,请查看日志: $LOG_FILE${NC}"
    cat "$LOG_FILE" | tail -20
    exit 1
  fi
  exit 0
fi

# ── 前台模式(默认) ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}🚀 启动 QiLin Gateway(前台)${NC}"
echo "   端口:   $PORT"
echo "   进程:   $$"
echo "   Secret: $(echo "$QILIN_INTERNAL_AUTH_TOKEN" | head -c 12)..."
echo "   停止:   Ctrl+C 或 $0 --stop"
echo ""

exec "$UVICORN_BIN" app.gateway.app:app \
  --port "$PORT" \
  --host 127.0.0.1 \
  --no-access-log
