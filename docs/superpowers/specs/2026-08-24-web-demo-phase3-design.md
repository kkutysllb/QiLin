# QiLin Web Demo — Phase 3 Spec (Admin / Observability)

> **状态**:Draft v1
> **日期**:2026-08-24
> **Phase**:P3(收官,覆盖剩余 9 个子系统)
> **前置**:Phase 0+1+2 已完成并推送

---

## 1. Phase 3 范围与现实约束

原设计 Phase 3 = 9 子系统(Authz/Guardrails/Sandbox/Tracing/Persistence/Reflection/WorkspaceChanges/Community/Integrations)。

**gateway 实际暴露的端点盘点**(OpenAPI 扫描结果):

| 子系统 | 端点数 | 端点 |
|--------|--------|------|
| **Integrations** | 6 | `/api/integrations/lark/{status,install,auth/start,auth/complete,config/start,config/complete}` |
| **Persistence** | 2 | `/api/persistence/{status,usage}` |
| **Workspace Changes** | 1 | `/api/threads/{thread_id}/runs/{run_id}/workspace-changes` |
| **Tracing** | 0(用 console) | `/api/console/{runs,stats,usage}` + `/api/threads/{id}/runs/{id}/events` |
| **Datasources** | 3(扩展) | `/api/datasources`、`/api/datasources/env-keys`、`/api/datasources/test` |
| **Authz / Guardrails / Sandbox / Reflection / Community** | 0 | 无端点 |

**结论**:
- **5 个真实功能**:Integrations / Persistence / Workspace Changes / Tracing / Datasources
- **5 个占位页面**:Authz / Guardrails / Sandbox / Reflection / Community
  - 占位页显示子系统说明 + 引用 Config section(很多配置已在 Config 页面)
  - 明确写"等 gateway 暴露 API 后启用"
  - 避免假装有功能 — 诚实交付

---

## 2. 关键决策

| 维度 | 决策 |
|------|------|
| **Integrations 范围** | Phase 3 只做 Lark 集成(其他 integration 无 API);完整 OAuth Device Code 流程 |
| **Tracing 数据来源** | 用 console/runs + console/stats + console/usage + 单 run events 聚合;不做 Langfuse 集成(无 API) |
| **Datasources** | 归类到 Phase 3(Persistence 同类)— sandbox 的数据源配置 |
| **占位页样式** | 用 Alert + 引用 Config section + 端点清单(让用户知道等什么) |
| **Sandbox / Reflection / Community** | Sandbox 在 Config 已有 sandbox section;Reflection 用 thread state 端点可凑出简单测试;Community 引用 Skills 页 |
| **复用** | 100% 复用 Phase 0/1/2 资产,0 新依赖 |

---

## 3. 文件清单(增量)

```
web-demo/
├── app/
│   └── (admin)/
│       ├── authz/page.tsx                    NEW (占位)
│       ├── guardrails/page.tsx               NEW (占位)
│       ├── sandbox/page.tsx                  NEW (占位)
│       ├── tracing/page.tsx                  NEW (Console 聚合)
│       ├── persistence/page.tsx              NEW
│       ├── reflection/page.tsx               NEW (占位 + 简单解析测试)
│       ├── workspace-changes/page.tsx        NEW
│       ├── community/page.tsx                NEW (占位)
│       └── integrations/page.tsx             NEW (Lark OAuth)
├── components/
│   ├── integrations/
│   │   ├── integration-status-card.tsx       NEW
│   │   ├── lark-install-flow.tsx             NEW (Device Code 流程)
│   │   └── integration-feature-table.tsx     NEW
│   ├── persistence/
│   │   ├── persistence-stats.tsx             NEW
│   │   └── persistence-usage-panel.tsx       NEW
│   ├── tracing/
│   │   ├── console-stats-grid.tsx            NEW
│   │   └── console-runs-table.tsx            NEW
│   ├── workspace-changes/
│   │   ├── workspace-change-card.tsx         NEW
│   │   └── workspace-changes-list.tsx        NEW
│   └── shared/
│       └── placeholder-page.tsx              NEW (统一占位样式)
├── lib/
│   ├── api/
│   │   ├── integrations.ts                   NEW
│   │   ├── persistence.ts                    NEW
│   │   └── console.ts                        NEW
│   └── types/
│       ├── integration.ts                    NEW
│       ├── persistence.ts                    NEW
│       └── console.ts                        NEW
└── components/layout/
    └── nav-config.ts                          MODIFY (启用 9 个 P3 项)
```

**预计**:30 个新文件,~1500 行代码,~10 个新组件。

---

## 4. 验收标准

### Phase 3 完成时

- [ ] 9 个 P3 子页面路由可达
- [ ] Sidebar 9 项从 disabled 变为 active
- [ ] **Integrations**:Lark status card 显示集成状态,有 Install / Auth Start 按钮
- [ ] **Persistence**:数据库 backend / migrations / usage 三张卡,数字真实
- [ ] **Workspace Changes**:输入 thread_id + run_id 后展示文件变更列表(可能为空)
- [ ] **Tracing**:console/stats 聚合显示(runs count / token usage / cache hit rate)
- [ ] **Datasources**:数据源列表 + 环境变量名(可能为空)+ test 按钮(Phase 3 占位基础)
- [ ] **占位 5 个**(Authz/Guardrails/Sandbox/Reflection/Community):有清晰的说明 + Config section 引用
- [ ] typecheck 通过,9 个新页面 HTTP 200
- [ ] 累计 22/25 子系统(88%)有页面

---

## 5. 与 Phase 0+1+2 的关系

| 维度 | Phase 0+1+2 | Phase 3 |
|------|-------------|---------|
| 新增子系统 | 14 | 9 (5 真实 + 4 占位) |
| 新增 API 客户端 | 13 | 3 (integrations/persistence/console) |
| 新增页面 | 13 | 9 |
| 新增组件 | ~50 | ~10 |
| 新增依赖 | 50+ | 0 |
| 代码复用率 | — | 80%+ |

---

## 6. Phase 3 完成 = Web Demo 全量交付

累计覆盖:
- **P0(6)**:Chat / Threads / Runs / Skills / 总览 / 登录
- **P1(4)**:Tools / MCP / Memory / Uploads
- **P2(4)**:Channels / Scheduler / Models / Config
- **P3(5)**:Integrations / Persistence / Tracing / Workspace Changes / Datasources
- **P3 占位(4)**:Authz / Guardrails / Sandbox / Reflection / Community

**总计 22 个真实交互页面 + 4 个占位 = 22/25 子系统有页面(88%)**。

剩余 3 个无端点子系统(Audit? / Metrics? / Billing?)未列出,等 gateway 后续版本补充。