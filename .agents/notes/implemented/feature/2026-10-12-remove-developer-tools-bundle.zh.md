# Agent Note: 开发者工具组合包已从产品移除

Status: implemented

[English](2026-10-12-remove-developer-tools-bundle.md) | 中文

## 问题

Official 分组随产品交付「开发者工具」可选组合包（`@qilin-agent/experimental-inspector-profile`）：会话原始日志、聊天分组与正文的双向定位，以及内嵌 Host 调试，横跨三个包（`experimental-inspector-profile`、`experimental-inspector`、`experimental-session-inspector`）。产品不要这个调试面。

## 决策

所有者已于 2026-10-12 将该组合包移出产品。`experimental-inspector-profile` 退出 `OPTIONAL_BUNDLES` 与 apps/cli 运行时闭包；三个包连同 `ctx.inspector` 服务、会话检查器客户端页面与内嵌的 DevTools 前端一并删除。此决定部分取代[以可选组合包交付实验能力](../architecture/2026-09-21-experimental-capabilities-as-optional-bundles.zh.md)中的 Inspector 部分。

## 已考虑的替代方案

**只摘清单行、保留包。** 插件页不再列出该条目，但三个已发布的实验包及其依赖闭包仍会随每次发布出行，服务于一个无人交付的产品。

**停用该行、保留包。** 发布一个其包已不再随版交付的开关，就是子代理移除时已为同样理由终结过的死路。

## 后果

**所得：** 插件页不再列出开发者工具，`qilin plugin add` 无法再解析它，任何发布都不再携带会话原始日志浏览与聊天分组导航面。`OPTIONAL_BUNDLES` 收录十一项。

**代价：** 恢复该能力需要从历史找回被删的包，并重建目录、tsconfig 与文档接线。
