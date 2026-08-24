# QiLin Web Demo — Design Spec

> 状态 / Status: **Draft v1 · 待用户审阅**
> 日期 / Date: 2026-08-24
> 作者 / Author: QiLin engineering
> 关联 / Related: v2.0.0 多智能体框架,QiLin 引擎全部子系统

### 自评审 / Self-Review Checklist

- [x] 无 TBD/TODO/占位符(第 11 节开放问题均为 Phase 0 之后细化项,不阻塞)
- [x] 架构与功能描述一致(数据流、技术决策、目录结构互不矛盾)
- [x] Scope 聚焦(P0-P3 分阶段,每阶段独立可验收)
- [x] 无二义性要求(关键决策均给出唯一推荐选项)
- [x] 验收标准可测试(Phase 0 含 12 条可勾选验收项)

---

## 1. 概述 / Overview

为 QiLin v2.0.0 引擎构建一个 **生产级 Web 演示应用**,覆盖 25 个子系统的全部用户可操作功能。

### 1.1 目标 / Goals

- **真实可运行**:直连 `app/gateway` FastAPI 服务(本机 uvicorn 启动)
- **生产级品质**:类型严格、错误处理完善、UI 现代大气
- **覆盖完整**:25 个子系统全部具备交互页面
- **可演示**:能在产品发布、技术分享、客户演示场景独立使用

### 1.2 非目标 / Non-Goals

- 不重写任何 QiLin 后端逻辑
- 不引入新的后端协议或新 REST 路由
- 不做移动端适配(只做桌面端响应式)
- 不做生产级鉴权增强(沿用 gateway 现有 local provider)
- 不替代 LangGraph Studio(只演示,不调试)

### 1.3 用户 / Users

| 用户角色 | 典型场景 |
|---------|---------|
| **产品演示者** | 客户/合作伙伴演示 QiLin 全部能力 |
| **开发者** | 体验 QiLin 完整用户旅程,辅助开发 |
| **技术评估者** | 评估 QiLin 在生产中的可行性 |

---

## 2. 关键决策 / Key Decisions

| 维度 | 决策 |
|------|------|
| 后端接入 | **真实接入** `app/gateway`(硬性要求启动) |
| 技术栈 | **Next.js 14 (App Router) + TypeScript strict + Tailwind CSS + shadcn/ui** |
| 数据获取 | Server Components + Route Handlers 直连 gateway;TanStack Query 客户端缓存 |
| 实时通信 | **浏览器 EventSource 直连 gateway**(不走 BFF 代理,保 SSE 实时性) |
| 状态管理 | Zustand(局部) + TanStack Query(服务端状态) |
| 主题 | 现代暗黑 + 青龙(深青绿/墨)主色,shadcn neutral 底 |
| 代码位置 | QiLin 仓库根目录下 **`web-demo/`** 同级子目录 |
| 降级策略 | 硬性要求 gateway 必须起;启动前 health-check 失败则 web-demo 拒绝启动 |
| 测试 | Vitest + Testing Library(组件);ESLint + Prettier(代码) |
| 包管理 | pnpm(与 QiLin 主仓的 uv 解耦) |

---

## 3. 架构 / Architecture

### 3.1 目录结构

```
QiLin/                                    # 现有仓库根
├── qilin/  app/  tests/  docs/  ...       # 既有内容(不变)
└── web-demo/                              # 新增同级子目录
    ├── package.json
    ├── pnpm-lock.yaml
    ├── next.config.mjs
    ├── tailwind.config.ts
    ├── tsconfig.json                     # strict: true
    ├── components.json                   # shadcn 配置
    ├── README.md                         # 启动说明
    ├── .env.example                      # GATEWAY_BASE_URL / GATEWAY_TOKEN
    ├── app/
    │   ├── layout.tsx                    # 根布局
    │   ├── page.tsx                      # 首页(总览仪表盘)
    │   ├── error.tsx                     # 全局错误边界
    │   ├── loading.tsx                   # 全局 loading
    │   ├── not-found.tsx
    │   ├── (workspace)/
    │   │   ├── chat/[thread_id]/page.tsx
    │   │   ├── threads/page.tsx
    │   │   └── runs/page.tsx
    │   ├── (market)/
    │   │   └── skills/page.tsx
    │   ├── (admin)/                      # 后续 P1-P3 占位
    │   │   ├── tools/page.tsx
    │   │   ├── mcp/page.tsx
    │   │   ├── memory/page.tsx
    │   │   ├── uploads/page.tsx
    │   │   ├── channels/page.tsx
    │   │   ├── authz/page.tsx
    │   │   ├── guardrails/page.tsx
    │   │   ├── sandbox/page.tsx
    │   │   ├── models/page.tsx
    │   │   ├── tracing/page.tsx
    │   │   ├── scheduler/page.tsx
    │   │   ├── config/page.tsx
    │   │   ├── persistence/page.tsx
    │   │   ├── reflection/page.tsx
    │   │   ├── workspace-changes/page.tsx
    │   │   ├── community/page.tsx
    │   │   └── integrations/page.tsx
    │   └── api/
    │       └── health/route.ts           # gateway 健康检查
    ├── components/
    │   ├── ui/                           # shadcn 组件封装
    │   ├── layout/
    │   │   ├── sidebar.tsx
    │   │   ├── topbar.tsx
    │   │   └── nav-config.ts
    │   ├── chat/
    │   │   ├── chat-view.tsx
    │   │   ├── message-list.tsx
    │   │   ├── message-item.tsx
    │   │   ├── tool-call-card.tsx
    │   │   ├── subagent-card.tsx
    │   │   ├── orchestrator-graph.tsx    # 多智能体可视化(react-flow)
    │   │   ├── token-usage-bar.tsx
    │   │   ├── thread-list-panel.tsx
    │   │   └── composer.tsx
    │   ├── skills/
    │   │   ├── skill-grid.tsx
    │   │   ├── skill-card.tsx
    │   │   ├── skill-detail-drawer.tsx
    │   │   ├── skill-upload-dialog.tsx
    │   │   └── skill-scan-progress.tsx
    │   ├── threads/
    │   │   ├── threads-table.tsx
    │   │   ├── thread-detail-drawer.tsx
    │   │   └── thread-messages.tsx
    │   ├── runs/
    │   │   ├── runs-table.tsx
    │   │   └── run-detail-drawer.tsx
    │   └── shared/
    │       ├── data-table.tsx            # shadcn DataTable 封装
    │       ├── connection-banner.tsx
    │       ├── empty-state.tsx
    │       └── error-state.tsx
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts                 # gateway fetch 封装
    │   │   ├── auth.ts                   # JWT 登录
    │   │   ├── threads.ts
    │   │   ├── runs.ts
    │   │   ├── skills.ts
    │   │   ├── tools.ts
    │   │   ├── mcp.ts
    │   │   ├── memory.ts
    │   │   ├── uploads.ts
    │   │   ├── channels.ts
    │   │   ├── authz.ts
    │   │   ├── guardrails.ts
    │   │   ├── sandbox.ts
    │   │   ├── models.ts
    │   │   ├── tracing.ts
    │   │   ├── scheduler.ts
    │   │   ├── config.ts
    │   │   ├── persistence.ts
    │   │   ├── reflection.ts
    │   │   ├── workspace-changes.ts
    │   │   ├── community.ts
    │   │   ├── integrations.ts
    │   │   └── index.ts
    │   ├── sse/
    │   │   ├── use-event-source.ts       # 自定义 hook(自动重连)
    │   │   └── stream-types.ts
    │   ├── auth/
    │   │   ├── session.ts                # 客户端 session 管理
    │   │   └── token-storage.ts
    │   ├── types/                        # 手写 DTO 类型(无 OpenAPI codegen)
    │   │   ├── thread.ts
    │   │   ├── run.ts
    │   │   ├── skill.ts
    │   │   ├── tool.ts
    │   │   ├── mcp.ts
    │   │   └── ...
    │   └── utils.ts                      # cn(), formatDate(), 等
    ├── hooks/
    │   ├── use-gateway.ts                # gateway 连接状态
    │   ├── use-sse-run.ts                # 订阅 run SSE
    │   └── use-debounce.ts
    ├── styles/
    │   └── globals.css                   # Tailwind + shadcn vars
    └── public/
        └── qilin-logo.svg
```

### 3.2 数据流(以 Chat 为例)

```
[Browser]
   │
   ├─ EventSource("/api/threads/{id}/runs/stream")
   │     └─ 直连 gateway,接收 SSE 事件
   │
   └─ TanStack Query (HTTP)
         └─ Next.js Server Component fetch
              └─ http://127.0.0.1:8080/api/... (gateway)
```

- **SSR 初始数据**:Server Component `fetch` gateway,首屏直出
- **流式事件**:浏览器 EventSource 直连,不走 Next.js(避免 SSE buffer)
- **变更操作**:Server Action → gateway POST/PUT/DELETE,revalidate 缓存

### 3.3 关键技术细节

| 关注点 | 方案 |
|--------|------|
| **认证** | local provider:浏览器登录拿 JWT,存 httpOnly cookie(由 gateway 设置);BFF 转发 cookie |
| **CORS** | gateway 端允许 `http://localhost:3000`(已在 `csrf_middleware.py` 中放行 `app://`);web-demo 也只跑同源 |
| **类型安全** | TypeScript strict + 手写 DTO 类型(网关未提供 OpenAPI 时) |
| **错误捕获** | 全局 `error.tsx` + 组件级 `ErrorBoundary` + fetch wrapper 统一处理 |
| **SSE 断线重连** | `use-event-source` hook 内置指数退避 |
| **性能** | Next.js `revalidate` 短期缓存;客户端组件用 `dynamic()` 拆分 |
| **多智能体可视化** | react-flow(节点:orchestrator/worker;边:handoff;动画:进行中) |
| **Markdown 渲染** | react-markdown + remark-gfm + Shiki 代码高亮 |
| **拖拽上传** | react-dropzone(skill 上传) |

---

## 4. UI/UX 设计 / UI Design

### 4.1 设计语言

| 元素 | 选型 |
|------|------|
| 字体 | Inter (UI), JetBrains Mono (代码), Noto Sans SC (中文兜底) |
| 主题 | **暗色优先**(next-themes),shadcn `neutral` 基础调色板 + 自定义 qilin accent |
| 主色 | 青绿 `#10b981` 系列(hover/active) + 墨色 `#0a0a0a`(背景) |
| 强调色 | 琥珀 `#f59e0b`(告警),紫 `#a855f7`(多智能体),红 `#ef4444`(错误) |
| 圆角 | `rounded-lg`(默认)/`rounded-xl`(卡片) |
| 阴影 | shadcn 默认 + 自定义微光(`shadow-glow-primary`) |
| 动效 | Framer Motion(页面/卡片入场,SSE 事件流入) |
| 图标 | lucide-react |
| 代码高亮 | Shiki(SSR 友好) |

### 4.2 全局布局

```
┌──────────────────────────────────────────────────────────┐
│ Topbar: [QiLin Logo] [Env:dev] ... [Theme] [User]        │ 56px
├──────┬───────────────────────────────────────────────────┤
│      │  Breadcrumb: 总览 / 对话 / 线程-abc                │
│ Side │  ┌──────────────────────────────────────────────┐ │
│ bar  │  │  Page Title                       [Actions]  │ │
│ 240px│  ├──────────────────────────────────────────────┤ │
│      │  │                                              │ │
│ 总览  │  │  Page Content                               │ │
│ 对话  │  │                                              │ │
│ 线程  │  │                                              │ │
│ 运行  │  │                                              │ │
│ ──   │  │                                              │ │
│ 技能  │  │                                              │ │
│ 工具  │  │                                              │ │
│ MCP  │  │                                              │ │
│ ...   │  │                                              │ │
│      │  └──────────────────────────────────────────────┘ │
└──────┴───────────────────────────────────────────────────┘
```

- Sidebar 按子系统分组折叠(P0-P3 进度可视化)
- Topbar 显示 gateway 连接状态(绿点/红点)
- 主内容区固定最大宽度 1440px,居中

### 4.3 P0 三页详细设计

#### 4.3.1 Chat 页 `/chat/[thread_id]`

**布局**:
```
┌─ Chat Page ──────────────────────────────────────────────┐
│ ┌── Threads (260px) ─┐ ┌── Messages (flex-1) ─────────┐ │
│ │ [+ New Chat]       │ │ Thread: thread-abc · GPT-4o  │ │
│ │ Search threads...  │ │ mode: multi · trace: 0x123   │ │
│ │ ─────────────────  │ │ ─────────────────────────── │ │
│ │ • thread-abc ●     │ │ [User] Explain Transformer   │ │
│ │ • thread-xyz       │ │ ─────────────────────────── │ │
│ │ • thread-def       │ │ [AI thinking...] ●●●         │ │
│ │ ...                │ │ ─────────────────────────── │ │
│ │                    │ │ [Tool: web_search]            │ │
│ │                    │ │  args: {q:"..."}              │ │
│ │                    │ │  result: 5 items             │ │
│ │                    │ │ ─────────────────────────── │ │
│ │                    │ │ [SubAgent: code-reviewer]     │ │
│ │                    │ │  status: running ●            │ │
│ │                    │ │ ─────────────────────────── │ │
│ │                    │ │ [AI Final] Transformer is... │ │
│ │                    │ │                              │ │
│ │                    │ ├──────────────────────────────┤ │
│ │                    │ │ Token: ████░░░░ 420/2000     │ │
│ │                    │ │ ┌──────────────────────┐     │ │
│ │                    │ │ │ Ask anything...       │     │ │
│ │                    │ │ └──────────────────────┘     │ │
│ │                    │ │                       [Send]  │ │
│ └────────────────────┘ └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────�
```

**关键交互**:
- 消息流:滚动到底部自动,SSE 事件驱动更新
- 工具调用卡片:可折叠/展开;沙箱状态指示器
- 子代理卡片:显示进度条、当前步骤、token 消耗
- 多智能体模式:右上角"可视化"按钮打开 `OrchestratorGraph`(react-flow 全屏 modal)
- 快捷键:`Cmd+K` 打开命令面板;`Cmd+Enter` 发送;`/` 触发命令

#### 4.3.2 Threads/Runs 页 `/threads`、`/runs`

- shadcn `DataTable` + TanStack Table
- 列:ID · 标题 · 创建时间 · 消息数 · 最后活动 · 状态 · Token · 操作
- 行点击打开右侧 `Drawer`(600px 宽),显示完整消息 + 元数据
- 批量操作:多选 + 删除/导出
- 过滤:状态、模型、时间范围
- 排序:所有列可排序

#### 4.3.3 Skills 页 `/skills`

- 网格/列表视图切换
- 卡片:技能名 · 描述(2行) · 来源徽章 · 启用开关 · 操作按钮
- 顶部工具栏:搜索 + 过滤(来源/状态) + 视图切换 + 上传
- 详情 Drawer:Markdown 描述 · 文件树 · 安全扫描结果 · 安装元数据
- 上传 Dialog:拖拽 → 实时显示静态扫描进度 → 安装结果

### 4.4 通用组件

| 组件 | 用途 |
|------|------|
| `<DataTable>` | 通用表格(基于 shadcn + TanStack Table) |
| `<Drawer>` | 详情侧拉(基于 vaul 或 shadcn sheet) |
| `<EmptyState>` | 空态(icon + 标题 + 描述 + CTA) |
| `<ErrorState>` | 错误态(重试按钮 + 错误详情折叠) |
| `<ConnectionBanner>` | gateway 连接状态横幅 |
| `<TokenUsageBar>` | 实时 token 消耗条 |
| `<ScanProgress>` | 技能扫描进度(带阶段标记) |

---

## 5. 分阶段交付计划 / Phased Delivery

### Phase 0 — MVP (核心用户旅程)

| 页面 | 完整度 |
|------|--------|
| 首页(总览仪表盘) | 完整 |
| Chat | 完整(SSE 流式 + 工具调用卡片 + 子代理卡片 + 多智能体可视化) |
| Threads | 完整(列表 + 详情) |
| Runs | 完整(列表 + 详情) |
| Skills | 完整(网格 + 详情 + 上传 + 启用) |
| 全局布局/主题/认证 | 完整 |

**目标**:可独立 demo;支持完整 Chat 流程 + Skills 上传 + 线程管理

### Phase 1 — Tools / MCP / Memory / Uploads

| 页面 | 完整度 |
|------|--------|
| Tools | 列表 + 启用/禁用 + 元数据查看 |
| MCP | 服务器连接管理 + 工具浏览 + OAuth 流程 |
| Memory | 事实 CRUD + 检索测试 + 摘要查看 |
| Uploads | 文件管理 + 虚拟路径 + 预览 |

### Phase 2 — Channels / Scheduler / Models / Config

| 页面 | 完整度 |
|------|--------|
| Channels | 8 大渠道连接管理 + 消息发送测试 + 命令面板 |
| Scheduler | Cron 任务 CRUD + 运行历史 |
| Models | Provider 配置 + 模型测试 |
| Config | YAML 编辑器 + 热重载监控 |

### Phase 3 — Admin / Observability

| 页面 | 完整度 |
|------|--------|
| Authz | 角色管理 + 资源授权矩阵 |
| Guardrails | 规则配置 + 拦截日志 |
| Sandbox | 后端切换 + 环境变量 |
| Tracing | Langfuse/Monocle 跳转 + Run Events 流 |
| Persistence | 数据库状态 + 迁移状态 |
| Reflection | 变量解析测试器 |
| Workspace Changes | 文件变更事件流 |
| Community | 技能市场浏览 + 导入 |
| Integrations | 第三方集成状态 |

---

## 6. 错误处理与降级 / Error Handling

### 6.1 错误层级

| 层级 | 处理 |
|------|------|
| **网关不可达** | 启动时 `health check` 失败 → 拒绝启动;运行时断连 → ConnectionBanner + 暂停操作 |
| **API 错误** | 统一 toast;带 `request_id`;错误详情折叠 |
| **SSE 断线** | 自动指数退避重连(1s → 2s → 4s → 8s,最大 30s);横幅提示"实时连接已断开,正在重连..." |
| **认证失败** | 自动跳转登录页 |
| **组件渲染错误** | ErrorBoundary 兜底,显示最小可用降级 UI |

### 6.2 错误展示样式

- 使用 shadcn `sonner` toast
- 错误结构:`{ title, description?, action?, request_id }`
- 严重错误使用 `Alert` 横幅(顶部固定)

---

## 7. 测试策略 / Testing

| 类型 | 工具 | 范围 |
|------|------|------|
| 类型 | TypeScript strict | 全部 |
| Lint | ESLint + Prettier | 全部 |
| 组件 | Vitest + Testing Library | 关键组件(ChatView/ToolCard/OrchestratorGraph/SkillCard/DataTable) |
| Hook | Vitest | useEventSource/useGateway |
| 集成 | MSW(Mock Service Worker) | API 调用测试 |
| E2E(可选) | Playwright | 认证 + Chat 主流程 |

**测试基线**:Phase 0 完成时核心组件覆盖 ≥ 60%

---

## 8. 部署与开发体验 / Dev & Deploy

### 8.1 启动流程

```bash
# 1. 启动 QiLin gateway(在 QiLin 根目录)
cd QiLin/
uv pip install -e ".[gateway,channels]"
uvicorn app.gateway.app:app --port 8080

# 2. 启动 web-demo(在 QiLin/web-demo/)
cd QiLin/web-demo/
pnpm install
cp .env.example .env.local   # 配置 GATEWAY_BASE_URL=http://127.0.0.1:8080
pnpm dev                      # http://localhost:3000
```

### 8.2 健康检查

web-demo 启动时调用 `GET {GATEWAY_BASE_URL}/api/health`,失败则:
```
[FATAL] Gateway not reachable at http://127.0.0.1:8080
        Please ensure: uvicorn app.gateway.app:app is running
Exiting...
```

### 8.3 README

- 一键启动说明
- 配置项说明
- 常见问题(认证、端口冲突、SSE 跨域)
- 截图(Phase 0 完成时)

---

## 9. 风险与缓解 / Risks

| 风险 | 缓解 |
|------|------|
| gateway 无 OpenAPI spec,需手写大量 DTO 类型 | 直接读 gateway router 源码手写类型;后续可加 codegen |
| SSE 跨域 / 认证问题 | gateway 已支持 CORS + CSRF;cookie 模式跨域需 sameSite 配置 |
| 25 子系统全交互工作量极大 | **分 P0-P3 四阶段交付,每阶段独立可用** |
| react-flow 对多智能体可视化是否合适 | 评估中;备选:手写 SVG + Framer Motion |
| shadcn 组件默认主题不够"青龙" | 自定义 theme CSS variables(青绿主色) |
| Next.js 14 与 gateway 版本/Node 版本兼容 | 锁定 Node 20+;pnpm 锁定 |

---

## 10. 验收标准 / Acceptance Criteria

### Phase 0

- [ ] `pnpm dev` 启动,gateway 健康检查通过,首页加载
- [ ] 暗色主题 + 青龙主色生效
- [ ] Chat 页:可新建 thread,可发送消息,SSE 流式正常显示,工具调用卡片展开正常
- [ ] Chat 页:多智能体模式下 OrchestratorGraph 节点动画可见
- [ ] Threads 页:列表分页/排序/搜索正常,详情 Drawer 正常
- [ ] Runs 页:列表/筛选/详情正常
- [ ] Skills 页:网格/列表切换,上传拖拽流程跑通,扫描进度可见,启用/禁用生效
- [ ] gateway 断网时,ConnectionBanner 显示,操作暂停,重连后恢复
- [ ] Lighthouse Performance ≥ 85, Accessibility ≥ 90
- [ ] TypeScript `tsc --noEmit` 通过
- [ ] ESLint 无 error
- [ ] 关键组件测试通过

### Phase 1-3

(每阶段独立验收,标准类似 Phase 0)

---

## 11. 开放问题 / Open Questions

1. **首页总览仪表盘**具体展示哪些 KPI?(Phase 0 设计中)
2. **OrchestratorGraph** 节点样式?(orchestrator = 圆形,worker = 方形;待 Phase 0 设计时细化)
3. **多语言**:中英双语?Phase 0 先做中文,后续 i18n?
4. **用户管理**:gateway 已有用户系统,demo 是否需要"切换用户"功能?

(以上问题不影响 Phase 0 启动,可在实施时与用户确认)
