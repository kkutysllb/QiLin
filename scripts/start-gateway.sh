#!/usr/bin/env bash
# 一键启动 QiLin Gateway(自动配置 internal auth token + 检查端口冲突)
#
# Usage:
#   ./scripts/start-gateway.sh           # 默认端口 8081
#   ./scripts/start-gateway.sh 8080      # 自定义端口
#
# 依赖:
#   - uvicorn in PATH(或 miniconda 的 uvicorn)
#   - python3(用于生成 secret)

set -euo pipefail

PORT="${1:-8081}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查端口冲突
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo -e "${RED}❌ 端口 $PORT 已被占用:${NC}"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN
  echo ""
  echo -e "${YELLOW}提示:${NC} 换一个端口,例如: $0 8082"
  echo "       或先停掉占用端口的进程: lsof -ti :$PORT | xargs kill"
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
    echo -e "${GREEN}✓ 已生成并持久化到 .qilin-internal-token(下次启动自动加载)${NC}"
  fi
fi

# 检查 config.yaml
if [[ ! -f config.yaml ]]; then
  echo -e "${RED}❌ config.yaml 不存在${NC}"
  echo "   请先 cp config.example.yaml config.yaml 并按需修改"
  exit 1
fi

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

echo ""
echo -e "${GREEN}🚀 启动 QiLin Gateway${NC}"
echo "   端口:   $PORT"
echo "   进程:   $$"
echo "   Secret: $(echo "$QILIN_INTERNAL_AUTH_TOKEN" | head -c 12)..."
echo "   日志:   tail -f /tmp/qilin-gateway.log(若用 --background)"
echo ""

exec "$UVICORN_BIN" app.gateway.app:app \
  --port "$PORT" \
  --host 127.0.0.1 \
  --no-access-log
