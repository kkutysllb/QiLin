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

## MCP 服务器分区 — 实施规格（可直接执行）

### A. host 侧仓储包 `packages/mcp/mcp-servers`（新建）

**职责**：对用户补丁文件做 mcp-client 实例的保真 CRUD 与内置项物化。

**文件位置**：用户层补丁 = `homePatchPath()`（`apps/cli/src/profile-boot.ts:73`），即 `<qilinHome>/cordis.patch.yml`；文件名常量 `PROFILE_PATCH_FILENAME = 'cordis.patch.yml'`（`packages/boot/app-boot/src/profile.ts:45`）。生效路径：`watchUserPatches`（`packages/boot/app-boot/src/index.ts:250`）监听该文件经 Cordis HMR 事务性重组插件树——**保存后无需重启**。

**数据模型**（来自 `packages/mcp/mcp-client/src/index.ts` 的 Config 判别联合）：

| 字段 | stdio | streamable-http |
|---|---|---|
| `transport` | `'stdio'` | `'streamable-http'` |
| `serverName` | `[A-Za-z0-9_-]{1,32}` | 同左 |
| 传输参数 | `command` / `args[]` / `env{}` / `cwd` | `url` 等 |
| 公共 | `toolCallTimeoutMs` / `failOnStartupError` / `reconnect?` | 同左 |

GUI 条目约定 `id = mcp-<serverName>`；每个实例 = 补丁层一个 `- insert: [<entry>]` 项（loader `applyEntryPatches`：insert 无 id 即顶层追加；直写条目会被报 `entry not found` 跳过）。启停 = 条目 `disabled` 字段。

**保真策略**（照搬 KCoder `desktop/main/mcp-store.ts`）：yaml `parseDocument` + Document API 只增删改匹配节点，其余内容（其他 patch、用户注释、原始格式）原样保留；**解析失败绝不写回**，返回 `ok:false` 让用户先修手编内容。

**内置项**（照搬 KCoder `desktop/main/mcp-builtin.ts`，用户已确认四项 fetch / context7 / sequential-thinking / playwright）：`BUILTIN_VERSION` 常量，修改任一内置定义时递增以触发已安装用户全量重写；状态文件 `<qilinHome>/mcp-builtin-state.json` 记录已同步名，只追加新增、用户删过的不复活；写入前用 `spawnSync` 探测 `command` 在 PATH 上可执行（无 `uvx`/`npx` 的机器不盲写，且顺手清理已失效条目）。playwright 的 `--cdp-endpoint` 需改为 QiLin 的浏览器宿主地址或省略。

**新建包必须齐备**（否则 `verify-*` 门禁失败）：`package.json`（`@qilin/mcp-servers`、`private: true`、cordis peer+dev）、`tsconfig.json`（extends `tsconfig.base.json`，`rootDir: src`/`outDir: lib/types`，登记进聚合）、`src/index.ts`（`Config` schema + service 类）、`README.md` + `README.zh.md`（双语配对，含 `## Model Experience` 与 `## Known Limitations and Deferred Work` 为最后两个 H2）、`tests/`、`./invariant` 仅在存在独立可观测关系时发布（否则 README 说明理由）。参照最近的同类包骨架。

### B. 客户端分区 `packages/client/ui-settings-mcp`（新建）

**接入面**：客户端分区通过 slot 的 `inject` 面拿到 `{ controller, useSnapshot, operations, t }`——见 `packages/client/ui-settings-models/src/client/ModelsSection.tsx`（`ModelsSectionFace` 是模板）。分区注册进 `settings.section`（契约在 `packages/client/ui-settings/src/client/contract/slots.ts`）。

**导航图标**：`SettingsRoot.tsx` 的 `navIcon(id)` 按分区 id 选图标，需为 MCP 分区补一个图标分支（新 id 落到默认齿轮即可，若要专属图标则加 `ui-primitives` 图标或复用现有）。

**UI**：列表（名称 / 传输 / 命令 / 内置徽标 / 启停开关 / 删除）+ 新增与编辑表单（serverName 校验、stdio 命令参数、http url）+ 错误回显（解析失败时提示用户手编修复）。文案全部走 typed locale 字典，`pnpm run verify-client-ui-i18n` 会拒硬编码。

**布局**：沿用刚完成的单页设置布局——内容已在 `.options > * { max-width: 960px }` 列内，分区内每个功能项独立成卡片即可。

### C. 校验

`pnpm run typecheck` / `pnpm run lint` / `pnpm run test`（新包单测 + 客户端组件测试）/ `pnpm run test:gui` / `pnpm run test:docs` / `pnpm run verify-package-dependencies` / `pnpm run verify-client-packages`。
