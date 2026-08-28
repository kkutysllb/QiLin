# QiLin v2.0.1 · 交互与视觉细节优化 / UX & Visual Refinement

> 发布时间 / Released: **2026-08-28**
> Tag: `v2.0.1`
> 基于 / Based on: **v2.0.0**（增量版本 / incremental release）

---

## ✨ 概览 / Overview

v2.0.1 聚焦工作台交互与视觉细节：优化侧边栏折叠体验、精简主菜单、美化用户消息气泡，并新增商标区版本标识。纯前端变化，无后端接口改动。

---

## 🚀 新增与改进 / What's New

- **侧边栏折叠保留窄图标条 / Icon-only collapsed sidebar** — 折叠后不再整体隐藏（offcanvas 无痕），保留一条 48px 窄图标按钮条，常驻快捷入口，悬停显示名称。
- **商标区折叠为 Logo，点击展开 / Logo to expand** — 折叠后顶部仅显示 QiLin Logo，点击即可重新展开侧边栏。
- **商标区版本徽章 / Version badge** — 展开态商标区新增版本徽章，展示当前版本号（v2.0.1）。
- **用户消息气泡简约升级 / Clean message bubble** — 用户消息气泡改为简约边框式设计，更大气、清晰。
- **侧边栏主菜单精简 / Slimmer sidebar menu** — 移除「技能」「MCP」快捷入口（功能仍保留于设置页），仅保留「自动化」。
- **完全访问模式确认弹窗 / Full-access confirm** — 工作区策略选择「全访问」时先弹出确认对话框，二次确认后才生效。
- **工作区识别与历史分组优化 / Workspace & history fixes** — 优化 workspace 识别与侧边栏历史任务分组展示。

---

## 🔄 兼容性 / Compatibility

- 纯前端交互与视觉优化，无后端接口变更，**向后兼容**。

---

## 🐛 已知限制 / Known Limitations

- 多智能体 multi 模式切换需重启进程（图结构变更，startup-only）。
- 侧边栏主菜单「技能」「MCP」入口已移除，相关配置请从设置页进入。
