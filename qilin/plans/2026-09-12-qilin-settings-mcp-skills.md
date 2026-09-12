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

## 技能分区：技能是插件机制（关键约束）

KCoder 的技能面板把**技能当插件产物**，与插件页严格分开（插件=引擎组成层；技能=提示词能力包）：

| KCoder 来源 | 含义 | QiLin 对应 |
|---|---|---|
| `builtin` | 随 skills bundle 分发的核心批，**插件激活时注册 runtime skill** | 插件在 `apply()` 内调 `ctx.skills.register()`（`SkillSource = 'runtime'`）或 `registerProvider()` 贡献的 `bundled` |
| `optional` | 随 bundle 分发但**不注册**的长尾批（零目录税）；拷到用户技能目录即启用 | 用户目录 = `~/.qilin/skills`（`user-qilin` rank 400，已由 `skill-filesystem` 扫描） |
| `project` | 工作区 `.dsh/skills`（rank 100）/ `.agents/skills`（rank 200） | `.qilin/skills`（`project-qilin`）/ `.agents/skills`（`project-agents`） |
| `user` | `$DSH_HOME/skills`（rank 400）+ `~/.agents/skills`（rank 500） | `~/.qilin/skills`（`user-qilin`）+ `~/.agents/skills`（`user-agents`） |

落地要点：

- 技能分区读 **`ctx.skills.list()`**（host 服务），按 `source` 分组成「插件提供 / 工作区 / 用户 / 自定义」，不自己扫盘。
- 「启用 optional 技能」= 把 bundle 内 `optional/<name>/` 拷到 `~/.qilin/skills/<name>/`（用户已确认此方案），复用 `skill-filesystem` 既有 rank 机制，无需新增扫描路径。
- 技能的注册/注销走 Cordis effect（`register`/方案 `registerProvider` 返回 disposer），插件销毁即摘除。
- 分区只读展示 + 正文预览走 `ctx.skills.get()`；白名单只放行最近一次枚举命中的路径。

## 待定

- QiLin 内置 MCP 集合照搬 KCoder 四个（fetch / context7 / sequential-thinking / playwright）——用户已确认。
- 单页化后侧边栏设置入口的返回路径（KCoder 注入「返回工作区」按钮）。
