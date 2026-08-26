#!/usr/bin/env bash
# 一键启动: QiLin gateway (28081) + web-demo (28080)
# 硬约束: 不影响本机已安装的 KWorks 应用 (19987/18569/~/.kworks) —— 只检测、不杀进程
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

GATEWAY_PORT="${GATEWAY_PORT:-28081}"
WEB_DEMO_PORT="${WEB_DEMO_PORT:-28080}"

# ── 端口冲突检测: 只报错退出, 绝不杀进程 ──
for P in "$GATEWAY_PORT" "$WEB_DEMO_PORT"; do
  if lsof -nP -iTCP:"$P" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ 端口 $P 已被占用:"
    lsof -nP -iTCP:"$P" -sTCP:LISTEN
    echo "提示: GATEWAY_PORT=28083 WEB_DEMO_PORT=28082 $0   (env 覆盖)"
    exit 1
  fi
done

# ── 依赖检查 ──
[[ -d web-demo/node_modules ]] || { echo "❌ web-demo 未安装依赖: cd web-demo && pnpm install"; exit 1; }
[[ -f config.yaml ]] || { echo "❌ config.yaml 不存在: cp config.example.yaml config.yaml"; exit 1; }

# ── 启动 gateway (daemon, 复用 start-gateway.sh 的 token/CORS 逻辑) ──
"$SCRIPT_DIR/start-gateway.sh" --daemon "$GATEWAY_PORT"

# ── 等待 gateway 健康 ──
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
  if [[ "$i" == "30" ]]; then
    echo "❌ gateway 30s 内未就绪: tail -f /tmp/qilin-gateway.log"
    exit 1
  fi
done
echo "✓ gateway healthy: http://127.0.0.1:${GATEWAY_PORT}/health"

# ── 启动 web-demo (前台; Ctrl+C 仅退出前端, gateway 保持 daemon) ──
export GATEWAY_TARGET_URL="http://127.0.0.1:${GATEWAY_PORT}"
export WEB_DEMO_PORT
echo "✓ web-demo   : http://localhost:${WEB_DEMO_PORT}"
echo "  (Ctrl+C 退出前端; 停 gateway: scripts/start-gateway.sh --stop)"
cd web-demo
exec node server.js
