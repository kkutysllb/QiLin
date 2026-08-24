# QiLin Web Demo

> **Phase 0 MVP** · 生产级 Web 演示应用 · 直连 `app/gateway`

![Phase](https://img.shields.io/badge/Phase-0%20MVP-success)
![Next.js](https://img.shields.io/badge/Next.js-14.2-black)
![TS](https://img.shields.io/badge/TypeScript-strict-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8)

---

## � 功能 / Features

| 页面 | 能力 |
|------|------|
| **总览仪表盘** `/` | 实时统计(线程/运行/技能/模型数) + 最近活动 |
| **对话** `/chat/[thread_id]` | SSE 流式 · Markdown 渲染 · Tool/Subagent 卡片 · OrchestratorGraph 可视化 |
| **线程** `/threads` | 列表 + 搜索 + 详情 Drawer(消息历史) |
| **运行** `/runs` | 列表 + 状态徽章 + 详情 Drawer(Token/错误) |
| **技能市场** `/skills` | 网格视图 + 来源过滤 + 启用切换 + 详情 Drawer |
| **登录** `/login` | 用户名/密码 + 错误处理 |

设计语言:暗色优先 + 青龙(深青绿 `#10b981`)主色 · shadcn/ui 中性基础 · Inter + JetBrains Mono

---

## 🛠 系统要求

- Node.js ≥ 20
- pnpm ≥ 9
- QiLin `app/gateway` 在 `http://127.0.0.1:8081`(本项目默认端口)运行
- QiLin v2.0.0+(`QILIN_INTERNAL_AUTH_TOKEN` 必须配置)

---

## � 启动 / Quick Start

### 1. 启动 QiLin Gateway

```bash
# 在 QiLin 仓库根目录(包含 config.yaml)
cd /Users/libing/kk_Projects/QiLin/

# 生成稳定 internal auth secret(≥32 字符)
export QILIN_INTERNAL_AUTH_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")

# 启动 gateway(默认 8081 端口)
uvicorn app.gateway.app:app --port 8081 --host 127.0.0.1
```

### 2. 启动 Web Demo

```bash
cd /Users/libing/kk_Projects/QiLin/web-demo/
pnpm install
cp .env.example .env.local   # 配置 GATEWAY_BASE_URL=http://127.0.0.1:8081
pnpm dev                     # → http://localhost:3000(或 3001)
```

启动时 Web Demo 会自动检查 Gateway 健康状态,不健康会显示 **诊断页面**(含 JSON 错误 + 重连指引)。

---

## ⚙️ 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `GATEWAY_BASE_URL` | `http://127.0.0.1:8081` | Gateway 地址 |
| `GATEWAY_AUTH_TOKEN` | (空) | 可选 Bearer Token(若 gateway 启用 static token) |
| `NEXT_PUBLIC_APP_NAME` | `QiLin Demo` | 应用名(显示在 Topbar) |

---

## 🧪 测试与质量

```bash
pnpm typecheck   # TypeScript strict — 必须 0 error
pnpm test        # Vitest 单元/组件测试(当前 7 个)
pnpm lint        # ESLint
pnpm build       # 生产构建
```

---

## 📂 架构

```
web-demo/
├── app/                        # Next.js 14 App Router
│   ├── (workspace)/            # 带 Sidebar 的工作区布局
│   │   ├── chat/               # 对话页(SSE 流式)
│   │   ├── threads/            # 线程页
│   │   └── runs/               # 运行页
│   ├── (market)/               # 技能市场布局
│   │   └── skills/             # 技能页
│   ├── login/                  # 登录页
│   ├── layout.tsx              # 根布局 + Gateway 健康门
│   └── page.tsx                # 总览仪表盘
├── components/
│   ├── ui/                     # shadcn 组件(16 个)
│   ├── layout/                 # Sidebar + Topbar + AppShell
│   ├── chat/                   # Chat 专用(11 个组件)
│   ├── threads/                # 线程表格 + Drawer
│   ├── runs/                   # 运行表格 + Drawer
│   ├── skills/                 # 技能网格 + Drawer
│   ├── home/                   # 总览仪表盘组件
│   └── shared/                 # DataTable + EmptyState + GatewayHealthGate
├── lib/
│   ├── api/                    # gateway REST 客户端(9 个领域)
│   ├── sse/                    # useEventSource(指数退避)
│   ├── gateway/                # config + health check
│   ├── auth/                   # 401 redirect helper
│   ├── types/                  # DTO 类型
│   └── utils.ts                # cn/formatDateTime/formatNumber/truncate
├── hooks/                      # useGatewayStatus
└── tests/                      # Vitest 单元测试
```

详见 [docs/superpowers/specs/2026-08-24-web-demo-design.md](../docs/superpowers/specs/2026-08-24-web-demo-design.md)。

---

## 🗺️ 路线图

- [x] **Phase 0** — 总览 + Chat + Threads + Runs + Skills(本版本)
- [ ] **Phase 1** — Tools / MCP / Memory / Uploads
- [ ] **Phase 2** — Channels / Scheduler / Models / Config
- [ ] **Phase 3** — Authz / Guardrails / Sandbox / Tracing / Persistence / Reflection / WorkspaceChanges / Community / Integrations

---

## ⚠️ 已知限制 / Known Limitations

- **没有真实模型时 Chat 不能回复**:`config.yaml` 必须包含至少一个 model(DeepSeek / OpenAI / Anthropic / Ollama 等),否则 SSE 流会立即收到 `error` 事件
- **认证处理简化**:依赖浏览器 cookie 传递 session token,OIDC SSO 暂未接入
- **OrchestratorGraph 是静态拓扑示例**:真实多智能体动态路由需要 Phase 1 接入 orchestrator SSE
- **Skills 上传对话框已设计但未实现**(Task 14 简化):当前 Skills 页只有查看与启用切换,无上传 UI

---

## 📜 许可证

Apache-2.0
