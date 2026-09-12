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
#   - uvicorn:优先项目内 .venv/bin/uvicorn,其次 PATH,最后 $HOME/miniconda3
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

# 检查 config.yaml:缺失时从示例自动生成(绝不覆盖已有文件;QILIN_CONFIG_PATH 优先)
if [[ ! -f config.yaml ]]; then
  if [[ -n "${QILIN_CONFIG_PATH:-}" ]]; then
    echo -e "${RED}❌ QILIN_CONFIG_PATH 指向的配置文件不存在: $QILIN_CONFIG_PATH${NC}"
    exit 1
  fi
  if [[ ! -f config.example.yaml ]]; then
    echo -e "${RED}❌ config.yaml 不存在,且找不到 config.example.yaml${NC}"
    exit 1
  fi
  cp config.example.yaml config.yaml
  echo -e "${YELLOW}⚠ config.yaml 不存在,已从 config.example.yaml 复制一份${NC}"
  echo -e "${YELLOW}  注意: 示例的 models 段默认全部注释,需按需放开至少一个模型才能对话${NC}"
fi

# CORS:默认放行本地 web-demo 端口(可被环境变量覆盖)
# Gateway 的 CORS middleware 是 opt-in:不设置 GATEWAY_CORS_ORIGINS 就根本不挂载
export GATEWAY_CORS_ORIGINS="${GATEWAY_CORS_ORIGINS:-http://localhost:28080,http://127.0.0.1:28080,http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,app://-,tauri://localhost}"

# ── 依赖自举:仓库内没有 .venv 时,按 pyproject 依赖自动创建并安装 ──────
# 关闭方式: QILIN_SKIP_AUTO_INSTALL=1  指定解释器: QILIN_PYTHON=/path/to/python3.13
_qilin_find_python() {
  local cand p
  for cand in "${QILIN_PYTHON:-}" python3.13 python3.12 python3 \
              /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 \
              /usr/local/bin/python3.13 /usr/local/bin/python3.12; do
    [[ -z "$cand" ]] && continue
    p="$(command -v "$cand" 2>/dev/null || true)"
    if [[ -z "$p" && -x "$cand" ]]; then p="$cand"; fi
    [[ -z "$p" ]] && continue
    # 解释器必须能 import socket(排除损坏的 Python 安装)且版本 >= 3.12
    if "$p" -c "import socket, sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 12) else 1)" >/dev/null 2>&1; then
      printf "%s" "$p"; return 0
    fi
  done
  return 1
}

_qilin_bootstrap_venv() {
  local venv="$PROJECT_ROOT/.venv" py cache_default own_cache=0
  echo -e "${YELLOW}⚠ 未找到 $venv/bin/uvicorn,自动创建虚拟环境并安装依赖(首次较慢)${NC}"
  if ! py="$(_qilin_find_python)"; then
    echo -e "${RED}❌ 未找到可用的 Python >=3.12(需能正常 import socket)${NC}"
    echo "   请安装 python@3.13 / python@3.12,或用 QILIN_PYTHON=/path/to/python3.13 指定"
    exit 1
  fi
  echo "   解释器: $py ($("$py" -V 2>&1))"
  if [[ ! -x "$venv/bin/python" ]]; then
    "$py" -m venv "$venv" || { echo -e "${RED}❌ 创建虚拟环境失败: $venv${NC}"; exit 1; }
  fi
  cache_default="$venv/.pip-cache"
  if [[ -z "${PIP_CACHE_DIR:-}" ]]; then export PIP_CACHE_DIR="$cache_default"; own_cache=1; fi
  echo "   安装依赖: .venv/bin/pip install -e \".[gateway,channels,browser]\""
  "$venv/bin/python" -m pip install --upgrade pip >/dev/null 2>&1 || true
  ( cd "$PROJECT_ROOT" && "$venv/bin/python" -m pip install -e ".[gateway,channels,browser]" ) || {
    echo -e "${RED}❌ 依赖安装失败${NC}"
    exit 1
  }
  [[ "$own_cache" == 1 ]] && rm -rf "$cache_default"
  [[ -x "$venv/bin/uvicorn" ]] || { echo -e "${RED}❌ 安装完成但未找到 $venv/bin/uvicorn${NC}"; exit 1; }
  echo -e "${GREEN}✓ 虚拟环境就绪: $venv${NC}"
}

if [[ ! -x "$PROJECT_ROOT/.venv/bin/uvicorn" && -z "${QILIN_SKIP_AUTO_INSTALL:-}" ]]; then
  _qilin_bootstrap_venv
fi

# 找到 uvicorn:优先项目内 .venv(自带解释器与依赖,不依赖系统 Python/conda),
# 其次 PATH(已 activate 的环境),最后兜底 $HOME/miniconda3。
if [[ -n "${UVICORN_BIN:-}" ]]; then
  if ! command -v "$UVICORN_BIN" >/dev/null 2>&1 && [[ ! -x "$UVICORN_BIN" ]]; then
    echo -e "${RED}❌ UVICORN_BIN 指定的 uvicorn 不可执行: $UVICORN_BIN${NC}"
    exit 1
  fi
elif [[ -x "$PROJECT_ROOT/.venv/bin/uvicorn" ]]; then
  UVICORN_BIN="$PROJECT_ROOT/.venv/bin/uvicorn"
  echo -e "${CYAN}ℹ 使用项目内 .venv: $UVICORN_BIN${NC}"
elif command -v uvicorn >/dev/null 2>&1; then
  UVICORN_BIN="$(command -v uvicorn)"
elif [[ -x "$HOME/miniconda3/bin/uvicorn" ]]; then
  UVICORN_BIN="$HOME/miniconda3/bin/uvicorn"
else
  echo -e "${RED}❌ 未找到 uvicorn${NC}"
  echo "   推荐在项目内建虚拟环境:"
  echo "     python3 -m venv .venv && .venv/bin/pip install -e \".[gateway,channels]\""
  echo "   也可显式指定: UVICORN_BIN=/path/to/uvicorn $0"
  exit 1
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
