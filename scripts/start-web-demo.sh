#!/usr/bin/env bash
# 一键启动 QiLin Web Demo
#
# Usage:
#   ./scripts/start-web-demo.sh          # 默认连 8081 端口 gateway
#   GATEWAY_BASE_URL=http://127.0.0.1:8082 ./scripts/start-web-demo.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DEMO_DIR="$PROJECT_ROOT/web-demo"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -d "$WEB_DEMO_DIR" ]]; then
  echo "❌ $WEB_DEMO_DIR 不存在"
  exit 1
fi

cd "$WEB_DEMO_DIR"

# 默认配置
export GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://127.0.0.1:8081}"
export NEXT_PUBLIC_APP_NAME="${NEXT_PUBLIC_APP_NAME:-QiLin Demo}"

echo -e "${GREEN}🚀 启动 QiLin Web Demo${NC}"
echo "   Gateway:  $GATEWAY_BASE_URL"
echo "   App:      http://localhost:3000"
echo ""

exec pnpm dev
