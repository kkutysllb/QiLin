# QiLin Web Demo — Phase 1 Spec (增量扩展)

> **状态**:Draft v1 · 用户已批准关键决策
> **日期**:2026-08-24
> **Phase**:P1(增量扩展 P0 已奠定的架构)
> **前置**:Phase 0 已完成并推送至 origin

---

## 1. Phase 1 范围

| 子系统 | 能力 | 新增/复用 |
|--------|------|-----------|
| **Tools** | 列表 + 启用/禁用 + 元数据查看 + 来源(mcp_sourced)徽章 | 复用 `toolsApi` + 复用 `DataTable` |
| **MCP** | 服务器连接管理 + 工具浏览 + **完整 OAuth 授权码流程** + 启用切换 | 复用 `mcpApi` + 新增 OAuth callback 路由 |
| **Memory** | 事实 CRUD + **检索测试 UI** + 摘要查看 + 统计 | 复用 `memoryApi` + 新增 search hook |
| **Uploads** | 文件列表 + 拖拽上传 + **智能预览**(文本/代码/MD/图片/PDF) | 复用 `uploadsApi` + 新增预览组件 |

---

## 2. 关键决策(用户批准)

| 维度 | 决策 |
|------|------|
| MCP OAuth | **完整 OAuth 授权码流程**(authorize → callback → token 持久化) |
| Uploads 预览 | **智能预览**:文本/代码 inline 渲染 + 图片 `<img>` + PDF `<iframe>` + 其他下载 |
| Memory 检索 | **UI 调用真实 `/api/memory/search`**,显示分数/置信度/来源 |
| 范围控制 | 4 个完整子系统(无 Phase 2/3 内容) |
| OAuth 状态 | Token 存 gateway 端(session 关联),web-demo 不持久化 secret |
| 测试 | Vitest 单元测试覆盖 OAuth state 生成 + 预览类型识别 |

---

## 3. 复用 Phase 0 资产

以下 Phase 0 已就绪,**Phase 1 直接复用,无需重复**:
- 完整 API 客户端(`lib/api/{tools,mcp,memory,uploads}.ts`)
- 类型定义(`lib/types/{tool,memory,upload}.ts`)
- shadcn UI 组件库(16 个)
- DataTable、EmptyState、ConnectionBanner、GatewayHealthGate
- 401 自动跳转 + Login 流程
- Sidebar 导航(P1 路由占位已留好,启用即可)

---

## 4. Phase 1 文件清单(增量)

```
web-demo/
├── app/
│   └── (admin)/
│       ├── tools/page.tsx                  NEW
│       ├── mcp/page.tsx                    NEW
│       │   └── oauth/callback/route.ts     NEW (OAuth redirect handler)
│       ├── memory/page.tsx                 NEW
│       └── uploads/page.tsx                NEW
├── components/
│   ├── tools/
│   │   ├── tools-table.tsx                 NEW
│   │   └── tool-detail-drawer.tsx          NEW
│   ├── mcp/
│   │   ├── mcp-server-grid.tsx             NEW
│   │   ├── mcp-server-card.tsx             NEW
│   │   ├── mcp-server-detail-drawer.tsx    NEW
│   │   ├── mcp-add-dialog.tsx              NEW (URL + OAuth)
│   │   └── mcp-tools-browser.tsx            NEW (服务器下的工具列表)
│   ├── memory/
│   │   ├── memory-stats.tsx                NEW
│   │   ├── memory-facts-table.tsx          NEW
│   │   ├── memory-fact-detail-drawer.tsx   NEW
│   │   ├── memory-search-panel.tsx         NEW (检索测试)
│   │   └── memory-create-dialog.tsx        NEW
│   └── uploads/
│       ├── uploads-grid.tsx                NEW
│       ├── upload-dropzone.tsx             NEW (拖拽上传)
│       ├── upload-card.tsx                 NEW
│       ├── upload-detail-drawer.tsx        NEW
│       └── preview-renderer.tsx            NEW (智能预览)
├── lib/
│   ├── oauth/
│   │   └── state.ts                        NEW (CSRF state 生成与校验)
│   ├── preview/
│   │   └── detect.ts                       NEW (文件类型识别)
│   └── api/                                (Phase 0 已就绪,无需新增)
└── tests/
    ├── lib/oauth/state.test.ts             NEW
    ├── lib/preview/detect.test.ts          NEW
    └── components/memory/memory-search-panel.test.tsx   NEW
```

**预计**:24 个新文件,~1500 行代码,~10 个新组件。

---

## 5. 验收标准

### Phase 1 完成时

- [ ] 4 个 P1 子页面路由可达(`/tools`、`/mcp`、`/memory`、`/uploads`)
- [ ] Sidebar P1 项从 disabled 变为 active,点击可导航
- [ ] Tools 表格可查看、可启用/禁用
- [ ] MCP 可添加服务器(URL + auth),OAuth 跳转流程打通,callback 路由处理授权码
- [ ] Memory 可查看事实列表、可创建新事实、可执行检索查询并显示结果
- [ ] Uploads 可拖拽上传、可列表查看、智能预览(文本/图片/PDF)
- [ ] typecheck 通过
- [ ] 新增单元测试通过(预计 ≥ 10 个)

---

## 6. 与 Phase 0 的关系

| 维度 | Phase 0 | Phase 1 |
|------|---------|---------|
| 架构 | 建立 | 复用 |
| API 客户端 | 9 个模块 | 复用 + 已有覆盖 P1 |
| shadcn UI | 16 个 | 复用 |
| 新增页面 | 6 个(总览 + 4 子系统 + login) | 4 个 |
| 新增组件 | ~30 个 | ~10 个 |
| 新增依赖 | 50+ 个 | 0 个(全用 Phase 0 已装) |
| OAuth 流程 | 无 | 新增 |
| 智能预览 | 无 | 新增 |

**复用率**:Phase 1 约 70% 代码复用 Phase 0。
