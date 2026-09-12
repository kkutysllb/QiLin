# 设置页面单页化 + MCP / 技能分区（参考 KCoder）

状态：待实施
参照实现：`/Users/libing/kk_Projects/KCoder`（QiLin 的 Electron 桌面分叉）

## 目标

1. **设置页面单页化**：QiLin 的 `SettingsRoot` 现在是居中模态浮层（overlay/mask/panel 三层 + 左侧 nav rail）。改成铺满窗口的单页两分栏——左 nav rail、右内容卡片列，与工作区「左列表右内容」一致。**不弹出 dialog**。
2. **MCP 服务器分区**：在设置页新增「MCP 服务器」分区，管理 `cordis.patch.yml` 里的 mcp-client 实例（增删改、启停、内置徽标）。
3. **技能分区**：新增「技能」分区，展示技能目录（按来源分组）、查看正文、启用/停用可选技能。

## KCoder 参照

| KCoder 文件 | 作用 | QiLin 对应做法 |
|---|---|---|
| `desktop/main/settings-page.ts` | 用 CSS 注入把上游模态浮层改成铺满窗口单页：panel 以 `fixed inset 0` 铺满，nav rail 用 sidebar 同款 token 分层，内容区限宽 960px 卡片列 | **原生改** `packages/client/ui-settings` + `ui-settings-general` 的 SettingsRoot 布局，不注入 |
| `desktop/main/mcp-store.ts` | 对 `$DSH_HOME/profiles/web/cordis.patch.yml` 里 mcp-client 实例做 CRUD；YAML Document API 只改匹配节点，其余内容（注释、其他 patch）原样保留；解析失败不写回 | 新增 host 侧 MCP 服务器仓储服务，复用 yaml Document 保真策略 |
| `desktop/main/mcp-builtin.ts` | 内置推荐 MCP（fetch/context7/sequential-thinking/playwright），首启写入、升级只追加、带命令可用性门 | 可选：QiLin 内置集 + `BUILTIN_VERSION` |
| `desktop/main/mcp-settings.ts` | DOM 注入 MCP 分区 + console 通道与主进程通信 | 改为 QiLin 原生 `settings.section` 贡献 + Typert RPC |
| `desktop/main/skills-settings.ts` / `skills-catalog.ts` | 技能目录分组、正文预览、启用 optional 技能 | 复用 QiLin `skill` 服务与 `skill-filesystem` 根，新增客户端分区 |

KCoder 的 DOM 注入 + console 通道是 Electron 形态的妥协（数据在主进程）。QiLin 是 Web harness，数据在 host 端，应走 slot + RPC 原生路径，不移植注入层。

## 交付物

1. `packages/client/ui-settings`：SettingsRoot 由模态改为单页两分栏。
2. `packages/mcp/mcp-servers`（新）：MCP 服务器仓储服务（list/save/delete + patch 保真写回 + HMR 生效）。
3. `packages/client/ui-settings-mcp`（新）：MCP 分区。
4. `packages/client/ui-settings-skills`（新）：技能分区。
5. RPC 描述符、locale 词条、组件与行为测试、双语 README。

## 待定

- QiLin 内置 MCP 集合是否照搬 KCoder（fetch / context7 / sequential-thinking / playwright）。
- 技能启用是否写用户目录副本（KCoder 做法）还是用 `skill-filesystem` 已有 rank 机制。
- 单页化后侧边栏设置入口的返回路径（KCoder 注入「返回工作区」按钮）。
