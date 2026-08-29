# QiLin v2.0.1 · 交互与视觉细节优化 / UX & Visual Refinement

> 发布时间 / Released: **2026-08-29**
> Tag: `v2.0.1`
> 基于 / Based on: **v2.0.0**（增量版本 / incremental release）

---

## ✨ 概览 / Overview

v2.0.1 聚焦工作台交互与视觉细节：重做消息时间流为 DSH 风格渲染（正文、思考、工具调用按真实顺序交替展示），新增 assistant 统一操作栏与运行元数据，并优化侧边栏折叠体验、精简主菜单、美化用户消息气泡、新增商标区版本标识。纯前端变化，无后端接口改动。

---

## 🚀 新增与改进 / What's New

- **消息时间流按真实顺序渲染 / In-order message stream** — AI 消息中的思考、正文与工具调用按源顺序交替呈现，不再将思考固定置于开头；同时支持数组 content block 与内联 `<think>` 标签的多段交替解析，并合并相邻同类段。
- **DSH 风格无卡片消息流 / Card-less DSH message style** — 思考区改为轻量 Think 行（可展开完整内容），工具调用改为平级工具行（含参数摘要与可展开详情），整体去卡片化，消息流更清爽。
- **用户消息气泡 DSH 风格 / DSH-style user bubble** — 用户消息气泡改为简约边框式设计，更大气、清晰；保留编辑、复制、图片与文件能力。
- **Assistant 统一操作栏 / Unified assistant footer** — 每条完整 AI 回复底部新增悬停操作栏：复制正文、将当前线程复制为新会话（分支）、重新生成；同时展示响应时间、模型名与 token 用量等可靠元数据。
- **会话线程复制与 URL 同步 / Thread copy & URL sync** — 普通会话与 Agent 会话均支持一键复制线程到新会话，并同步更新地址栏路由。
- **侧边栏折叠保留窄图标条 / Icon-only collapsed sidebar** — 折叠后不再整体隐藏（offcanvas 无痕），保留一条 48px 窄图标按钮条，常驻快捷入口，悬停显示名称。
- **商标区折叠为 Logo，点击展开 / Logo to expand** — 折叠后顶部仅显示 QiLin Logo，点击即可重新展开侧边栏。
- **商标区版本徽章 / Version badge** — 展开态商标区新增版本徽章，展示当前版本号（v2.0.1）。
- **侧边栏主菜单精简 / Slimmer sidebar menu** — 移除「技能」「MCP」快捷入口（功能仍保留于设置页），仅保留「自动化」。
- **完全访问模式确认弹窗 / Full-access confirm** — 工作区策略选择「全访问」时先弹出确认对话框，二次确认后才生效。
- **工作区识别与历史分组优化 / Workspace & history fixes** — 优化 workspace 识别与侧边栏历史任务分组展示。

---

## 🔄 兼容性 / Compatibility

- 纯前端交互与视觉优化，无后端接口变更，**向后兼容**。
- 消息分段解析对旧格式（单思考 block、内联 `<think>`）保持兼容。

---

## 🐛 已知限制 / Known Limitations

- 多智能体 multi 模式切换需重启进程（图结构变更，startup-only）。
- 侧边栏主菜单「技能」「MCP」入口已移除，相关配置请从设置页进入。
- `next build` 在静态导出内部 `/_global-error` 路由时会报 `useContext` 空值错误（Next.js 16 上游问题，参见 vercel/next.js#87719）。不影响 `next dev` 与运行时，且为 v2.0.1 之前已存在的问题；待 Next.js 补丁版本修复后升级。
