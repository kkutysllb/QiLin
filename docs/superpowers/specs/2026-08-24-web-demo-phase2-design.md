# QiLin Web Demo — Phase 2 Spec (Channels / Scheduler / Models / Config)

> **状态**:Draft v1
> **日期**:2026-08-24
> **Phase**:P2(增量扩展 P0+P1)
> **前置**:Phase 0 + Phase 1 已完成并推送

---

## 1. Phase 2 范围

| 子系统 | 能力 | 关键 API |
|--------|------|----------|
| **Channels** | 8 大渠道(dingtalk/discord/feishu/github/slack/telegram/wechat/wecom)启用/禁用 + 连接管理 + 重启 | `/api/channels/providers`、`/api/channels/connections`、`/api/channels/{name}/restart`、`/api/channels/{provider}/connect` |
| **Scheduler** | Cron 任务 CRUD + 手动触发 + 暂停/恢复 + 运行历史 | `/api/scheduled-tasks`、`/api/scheduled-tasks/{id}/{pause,resume,trigger,runs}` |
| **Models** | Provider 配置 CRUD + 单模型详情 + 启用切换 | `/api/models`、`/api/models/{model_name}` |
| **Config** | 整体配置查看 + 按 section 编辑 + 热重载监控 | `/api/config`、`/api/config/{section}`、`/api/config/restart` |

---

## 2. 关键决策

| 维度 | 决策 |
|------|------|
| **Channels OAuth** | Phase 2 只做连接列表 + 启停切换;OAuth 跳转流程走 Phase 3 (与 MCP OAuth 复用 `lib/oauth/state.ts`) |
| **Scheduler UI** | 表格 + 详情 Drawer + 触发/暂停按钮;新建/编辑用 Dialog 表单(cron 表达式 + 模型选择) |
| **Models UI** | 卡片网格(按 provider 分组) + 详情 Drawer;新建用 Dialog 表单 |
| **Config UI** | 分层树(左侧 section 列表 + 右侧 YAML 编辑器) + Save/Reload/Restart 按钮 |
| **Config YAML 编辑器** | 用 `<textarea>` + monospace 字体(Phase 0 没装 Monaco/YamlEditor,避免增加包大小) |
| **Channels runtime-config** | 通过 PATCH `/api/channels/{provider}/runtime-config` 启用/禁用单个 provider |
| **Cron 验证** | 不做语法校验,完全交给 gateway;提交后展示错误 toast |
| **复用** | 100% 复用 Phase 0/1 的 `DataTable`、`EmptyState`、`Drawer`、`Button`、`Input`、Toast |

---

## 3. 复用资产

P0+P1 已就绪,Phase 2 直接复用:
- API 客户端 9 个模块 → 增量 4 个(channels/scheduler/models/config)
- 类型定义 → 增量 4 个(channel/scheduler/model/config)
- shadcn UI 16 个 + DataTable/Drawer/EmptyState/ConnectionBanner
- TanStack Query + serverFetch 模式
- 401 自动跳转 + Login 流程
- Sidebar P2 占位已留好,启用即可

---

## 4. 文件清单(增量)

```
web-demo/
├── app/
│   └── (admin)/
│       ├── channels/page.tsx                  NEW
│       ├── scheduler/page.tsx                 NEW
│       ├── models/page.tsx                    NEW
│       └── config/page.tsx                    NEW
├── components/
│   ├── channels/
│   │   ├── channel-provider-card.tsx          NEW
│   │   ├── channel-provider-grid.tsx          NEW
│   │   ├── channel-connections-table.tsx      NEW
│   │   ├── channel-detail-drawer.tsx          NEW
│   │   └── channel-connect-dialog.tsx         NEW (URL + auth)
│   ├── scheduler/
│   │   ├── scheduler-table.tsx                NEW
│   │   ├── scheduler-detail-drawer.tsx        NEW
│   │   ├── scheduler-form-dialog.tsx          NEW (CRUD)
│   │   └── scheduler-runs-panel.tsx           NEW
│   ├── models/
│   │   ├── model-card.tsx                     NEW
│   │   ├── model-grid.tsx                     NEW
│   │   ├── model-detail-drawer.tsx            NEW
│   │   └── model-form-dialog.tsx              NEW
│   └── config/
│       ├── config-section-tree.tsx            NEW
│       ├── config-yaml-editor.tsx             NEW (textarea + monospace)
│       └── config-restart-banner.tsx          NEW
├── lib/
│   ├── api/
│   │   ├── channels.ts                        NEW
│   │   ├── scheduler.ts                       NEW
│   │   ├── models.ts                          NEW
│   │   └── config.ts                          NEW
│   └── types/
│       ├── channel.ts                         NEW
│       ├── scheduler.ts                       NEW
│       ├── model.ts                           NEW
│       └── config.ts                          NEW
└── components/layout/
    └── nav-config.ts                          MODIFY (启用 4 个 P2 项)
```

**预计**:26 个新文件,~1800 行代码,~20 个新组件。

---

## 5. 验收标准

### Phase 2 完成时

- [ ] 4 个 P2 子页面路由可达(`/channels`、`/scheduler`、`/models`、`/config`)
- [ ] Sidebar P2 项从 disabled 变为 active,点击可导航
- [ ] **Channels**:看到 8 个 provider 卡片(dingtalk/discord/feishu/github/slack/telegram/wechat/wecom),能看到 service_running 总状态,可点开 provider 详情
- [ ] **Scheduler**:任务表格显示 0 条(空态),可打开"新建" Dialog,填写 cron + input 提交后端 422 验证有效
- [ ] **Models**:模型卡片网格,空态提示"暂无模型 — 去 Config 配置",可打开"新建" Dialog 提交
- [ ] **Config**:左侧 section 树(config_version/log_level/sandbox/database/checkpointer/memory),右侧 YAML 编辑器显示选中 section,Save 提交后看到 success toast
- [ ] Config 页面有 "Restart Gateway" 按钮,点击触发 POST /api/config/restart
- [ ] typecheck 通过,新增 4 个页面 HTTP 200
- [ ] 至少 1 个新组件测试(scheduler cron 解析或 config JSON 解析)

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `/api/models` 返回 `{ models: [] }` 不是数组 | types 适配,前端统一按 `modelsApi.list().models` 访问 |
| `/api/config/{section}` 写入需重启才生效 | UI 上明确提示"修改后请点 Restart" + Restart 按钮 |
| Scheduler 的 cron 字段名不确定 | 用最小可用字段集 `name/cron/input/agent_name`,写错由 gateway 报错 |
| Channel OAuth Phase 2 不做 | Phase 2 只做连接列表 + 启停切换,OAuth 走 Phase 3 |

---

## 7. 与 Phase 0/1 的关系

| 维度 | Phase 0+1 | Phase 2 |
|------|-----------|---------|
| 新增子系统 | 10 个(Chat/Threads/Runs/Skills/Tools/MCP/Memory/Uploads + 总览 + Login) | 4 个 |
| 新增 API 客户端 | 9 个 | 4 个 |
| 新增依赖 | 50+ 个 | 0 个(全用 P0 已装) |
| 新增页面 | 10 个 | 4 个 |
| 新增组件 | ~40 个 | ~16 个 |
| 代码复用率 | — | 75%+ |
