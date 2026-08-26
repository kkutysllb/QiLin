# QiLin Web Demo

与 KWorks web 端全面对齐的麒麟引擎 Web 工作台（直接移植 + 纯 web 模式）。

由 KWorks `frontend/`（Next.js 16 / React 19 / Tailwind 4）整体移植而来：
剥离 Electron 专属层后在浏览器中以纯 web 模式运行，`isDesktop()` 分支自动走 web 路径，
API 层零改动；品牌与主题色已切换为 QiLin（麒麟）。

## 快速开始

```bash
# 1. 安装依赖（首次）
cd web-demo && pnpm install

# 2. 一键启动 gateway(28081) + web-demo(28080)
cd .. && ./scripts/start-all.sh

# 3. 打开 http://localhost:28080 完成首次初始化（或用已有账号登录）
```

> 端口占用时报错退出（绝不杀已有进程）；如本机装有 KWorks 桌面应用
> （19987/18569/~/.kworks），与 web-demo 完全隔离、可并行运行。

## 端口与隔离

| 进程 | 默认端口 | env 覆盖 |
|---|---|---|
| web-demo | 28080 | `WEB_DEMO_PORT` / `WEB_DEMO_HOST` |
| QiLin gateway | 28081 | `GATEWAY_PORT`（脚本）/ `GATEWAY_TARGET_URL`（代理目标） |

数据目录：仓库内 `.qilin/`（`QILIN_HOME` 默认），与 KWorks 应用 `~/.kworks/` 完全隔离。
密钥：gateway 启动时自动加载仓库根 `.env`（如 `MINIMAX_API_KEY`，供 config.yaml 中
`$VAR` 引用），`.env` 已被 gitignore。

## 架构

```
浏览器 → server.js（Next 自定义服务）
           ├─ /api/*、/health → http-proxy-middleware → QiLin gateway :28081
           │    · /api/langgraph/* 重写为 /api/*（langgraph SDK 路由）
           │    · SSE 无缓冲（聊天逐字流式，实测首字节 ~20ms）
           │    · WebSocket 升级转发（HMR 委托回 Next）
           └─ 其余请求由 Next 处理（App Router 页面 / 静态资源）
```

前端为 KWorks frontend 纯 web 模式。`pnpm dev:next`（原生 next dev）仍可用
next.config rewrites 作为 fallback，但该路径会缓冲 SSE（流式退化为整段输出），
日常请使用 `pnpm dev`。

## 常用命令

- `pnpm dev` — 启动（经同源代理，开发迭代用）
- `pnpm start` — 生产模式（需先 `pnpm build`）
- `pnpm smoke` — 代理/认证/SSE 冒烟测试（期望 `✅ PASS`，SSE 首字节 < 500ms）
- `pnpm typecheck` / `pnpm test` / `pnpm lint`
- `./scripts/start-gateway.sh --stop|--status` — 网关停止 / 状态

## 故障排查

- **502 `gateway_unreachable`**：gateway 未启动 → `./scripts/start-gateway.sh --daemon`
- **流式变成整段输出**：确认用的是 `pnpm dev`（server.js）而不是 `pnpm dev:next`
- **编译卡死 / "Unable to open static sorted file"**：Next 增量缓存损坏（多发生于大批量
  文件改动后）→ 停止服务，`rm -rf web-demo/.next` 后重启
- **`Environment variable MINIMAX_API_KEY not found`**：把密钥写入仓库根 `.env`
- **登录 401**：demo 测试账号为 `admin@example.com / QiLin#Demo2026`（首次启动走
  初始化向导自建账号）
- **文档站 /docs 404**：与 KWorks 上游一致（App Router 未注册 docs 路由），非故障

## 与 KWorks 上游的已知差异

| 差异 | 原因 |
|---|---|
| 品牌文案 / favicon / 主色为 QiLin | 品牌化（M4） |
| `defaultLocale` zh、html lang=zh | demo 面向中文用户 |
| 保留 `kworksDesktop` 等内部标识符 | web 模式下为死代码，保留以便上游同步 |
| browser_* 工具组未启用 | QiLin 主仓未装 playwright extra；启用需 `pip install "qilin[browser]" && playwright install chromium` 后在 config.yaml 恢复 browser 组 |
| `X-QiLin-Desktop` header 常量 | 品牌化 sed 连带改名，前后端自洽（后端无引用） |

## 验收

验收清单见 `docs/web-demo-acceptance-checklist.md`。
