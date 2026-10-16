# 插件管理页对齐上游 dsh（计划）

日期：2026-10-16 · 目标：**插件管理页与上游最新一致**——`ui-plugin-manager` 跟进上游形态、移植新包 `ui-plugin-market`（Discover 插件市场）、按上游重组后的位置呈现子智能体条目。先计划后动代码（[仓规：上游升级 plan-first](docs/cookbook/upgrading-from-upstream.md)）。

## 一、现状与 delta（已量化）

上游检出：`/Users/libing/kk_Projects/deepseek-harness`（0.2.1-alpha.5）。QiLin 现树停在上游 rc.2 附近的形态加上本地改动。

| 面 | 上游最新 | QiLin 当前 |
|---|---|---|
| `packages/client/ui-plugin-manager/src` | 每个文件都已演进；新增 `navigation-store.ts`、`tab-ledger.ts`（`plugins.tab` 插槽制表）、`sanitize-install-input.ts`、`assets/`（徽章/语音预览图 + `assets.d.ts`） | 旧形态 + 本地 `RowConfigForm.tsx/.module.css`（行级配置表单）与 `plugins.row.config` 插槽 |
| `packages/client/ui-plugin-market` | **存在**（7 个源文件，Discover/自定义市场源/安装流） | 不存在 |
| `ui-primitives` 图标 | `icons/index.tsx` 采用新命名（`IconCheckCircleFillRegular`、`IconChevronDownOutlineRegular`、`IconCloseOutlineMedium`、`IconTrashOutlineRegular` 等） | 旧命名（`IconCloseOutline16`、`IconTrashOutline16`、`IconChevronDownOutline14` 等）；**无** `Regular/Medium` 命名 |
| `ui-primitives` 组件 | `plugin-artwork.tsx`（`PluginArtworkDefault/Loop/Search/Subagent/Terminal`）、`SegmentedTabs.tsx`、`SegmentedControl.tsx` | **不存在**（`Menu`/`MenuItemButton`/`useAnchoredPosition`/`pointerModality` 已有） |
| 子智能体条目 | 上游 PR #5922（重组插件设置 + 实验目录页）与中文页改名「子智能体」的随行改动（上游检出 `0.2.1-alpha.5`）——**重组/改名，未删除** | 条目形态停在重组前 |

## 二、决策（已拍板，执行时按此）

1. **行级配置表单不要**：删除 `RowConfigForm.*`、`plugins.row.config` 插槽声明，并同步移除其消费侧文档与测试（`packages/extensions/kylin-client-runner/src/client/slot-catalog.ts` 的该槽条目、`ui-plugin-manager` 相关用例）。
2. **移植 `ui-plugin-market`**：Discover 标签页、自定义市场源与安装流一并进来，含其在组合包中的行与依赖声明。
3. **子智能体条目跟随上游重组后的位置**（设置内重组形态），不自创独立形态。

## 二之三、命名对齐规则（用户 2026-10-16 决定，覆盖此前判断）

**与上游 dsh 完全对齐**：凡 dsh 插件生态可见的公共面，一律采用上游 dsh 的命名与语义，不再使用本仓的改名版本；否则无法真正兼容 dsh 插件生态。仅保留仓库机械 rescope（workspace 包名 `@deepseek-ai/*` → `@qilin-agent/*`、cordis 依赖名、`QILIN_HOME` 等非插件面标识）。

落地清单（最终验收逐条核对）：

| 项 | 要求 |
|---|---|
| `PluginCompatibility` 字段 | 用上游 `requirements`（插件清单 `engines.dsh` / dsh peer 语义），删除本仓改名 `peers` 及其调用点与测试 |
| 图标公共名 | 上游 `IconXxxRegular` / `IconXxxMedium` 一等可用（本仓已有 upstream-named 别名段，页面所需全部补齐） |
| 主题变量 | 上游 `--dsw-*` 必须可用——本仓 `ui-theme/src/styles/dsw-compat.css` 已提供 426 个别名，覆盖上游 407 个，保持 |
| 槽 / 工具 / 配置键 / 类型名 | 与上游逐字一致 |
| 内部标识符 | 仅限非插件面者保留本仓命名（如 `getQilinRuntimeVersion`、`qilinHomePath`），并在验收报告注明 |

## 二之四、本轮按「对齐上游」口径做的两处裁决（Lead）

1. **`PluginCompatibility` 字段名回上游 `requirements`**（app-boot、plugin-manager、页面 `presentation.ts` 及各自测试同步改名；`packages/api/gateway` 的传输对端 `peers` 与该字段无关，未动）。
2. **不采纳上游「`engines.dsh` 未满足即拒绝」**：QiLin 版本线（3.1.6-rc.1）在语义上无法满足 dsh 插件的 `engines.dsh: ^0.2.x`，采纳会把每一个 dsh 插件拒装，与「无缝兼容 dsh 插件生态」相反。engines 保持 advisory（本仓 `QilinEnginesManifest` 已如此声明），仅 peerDependencies 参与判定。
3. **移除 CLI 的安装前置拒绝**（`refusedInstallSpecs`，QiLin 本地能力）：按去 fork 面口径，改为上游行为——安装照常进行，不兼容由安装后的加载拒绝与既有 `qilin plugin allow-version` 豁免承担。恢复路径：该实现的上一版见本仓 Git 历史中的 `packages/boot/plugin-manager/src/operations.ts`（`RefusedInstallSpecs` / `refusedInstallSpecs` 及 `LookupOptions`），需要时按其语义重新移植并恢复 `apps/cli/src/plugin.ts` 的调用点。

## 三、阶段（每阶段可独立验证）

- **A 依赖面补齐（ui-primitives）**：按上游移植本页用到的 `PluginArtwork*` 插画与 `SegmentedTabs`；图标采用**映射**而非整包改名——把上游页面的 `Regular/Medium` 引用映射到 QiLin 现有 `Xxx16/14` 命名，缺失者逐个补齐并记录映射表。
- **B 页面移植（ui-plugin-manager）**：以上游最新 `src/` 为准做 rescope（`@deepseek-ai/dsh-*` → `@qilin-agent/*`、`@deepseek-ai/cordis*` → `@qilin-agent/kylin*`、`dsh` → `qilin`），并入 `navigation-store`/`tab-ledger`/`sanitize-install-input`/`assets`；按决策 1 删除行配置面。
- **C 新包（ui-plugin-market）**：移植 + 三个注册面（`tsconfig.client.json` 聚合、`packages/bundle/web-app/cordis.patch.yml` 行、`packages/bundle/web-app/package.json` 依赖），并核对 Host 侧市场数据面是否需要配套行。
- **D 文案与文档**：locale 字典双语、包 README（含 Model Experience 段）、slot 目录（slot-catalog）与相关子系统文档同步。
- **E 门禁与验证**：`pnpm run test:gui`、`pnpm run lint`、`pnpm exec tsc -b tsconfig.host.json`、`pnpm run doc-sync`；随后真机验证插件管理页与 Discover 流。

## 四、风险与未决

1. **图标映射**：上游页面新引用的每个图标都要有 QiLin 等价物；缺失项按上游图形补齐，避免形状走样（逐条记录映射）。
2. **市场数据面**：`ui-plugin-market` 的 Discover 依赖安装/源解析侧能力，需确认 QiLin 侧 `api-remotes` 与 Host 行齐备，缺失则在该阶段补齐。
3. **本地特性回退**：行配置面删除会影响已声明该槽的文档与测试，须同批清理，避免悬空声明。
4. **验证成本**：本机可跑软件面门禁；Discover 的真实市场源在无网络凭据时不可端到端验证，标注为静态对齐 + 本地可跑部分。
## 附录：Phase A 图标映射表（已核对）

`ui-plugin-manager` 页面上游命名 → QiLin `ui-primitives/src/icons/index.tsx` 现名（QiLin 现有 89 个图标导出）：

| 上游 | QiLin | 状态 |
|---|---|---|
| `IconChevronDownOutlineRegular` | `IconChevronDownOutline14` | 映射 |
| `IconChevronLeftOutlineMedium` | `IconChevronLeftOutline14` | 映射 |
| `IconChevronRightOutlineRegular` | `IconChevronRightOutline14` | 映射 |
| `IconCloseOutlineMedium` | `IconCloseOutline16` | 映射 |
| `IconDownloadOutlineRegular` | `IconDownloadOutline16` | 映射 |
| `IconInfoOutlineRegular` | `IconInfoOutline14` | 映射 |
| `IconPlusOutlineRegular` | `IconPlusOutline16` | 映射 |
| `IconRefreshOutlineRegular` | `IconRefreshOutline14` | 映射 |
| `IconTrashOutlineRegular` | `IconTrashOutline16` | 映射 |
| `IconWarningOutlineRegular` | `IconWarningOutline16` | 映射 |
| `IconCheckCircleFillRegular` | —— | **需按上游图形补齐** |

组件缺项（需按上游移植）：`PluginArtworkDefault`、`PluginArtworkLoop`、`PluginArtworkSearch`、`PluginArtworkSubagent`、`PluginArtworkTerminal`（上游 `plugin-artwork.tsx`）、`SegmentedTabs`（上游 `SegmentedTabs.tsx` + `.module.css`）。已具备：`Menu`/`MenuItemButton`、`useAnchoredPosition`、`pointerModality`。

## 附录：槽面差异（slot surface delta，实测于生成目录）

以两棵树的生成目录 `slot-catalog.ts`（QiLin 86 个槽 / 上游 105 个槽）比对：

**上游有而 QiLin 缺（19）**：`conversation.chat.message.images`、`conversation.chat.user.images`、`conversation.hero.options`、`conversation.input.model.label`、`conversation.user.text.node`、`deliverables.file.actions`、`deliverables.review.file.actions`、`plugins.detail.actions`、`plugins.detail.badge`、`plugins.detail.section`、`plugins.tab`、`settings.launcher`、`settings.models.sign-in`、`settings.trigger`、`shell.leading`、`shell.quota-notice`、`sidebar.workspaces.session.menu.item`、`sidebar.workspaces.session.row.action`、`workspace.toast`。

**QiLin 有而上游无（5）**：`conversation.message.images`（上游已拆为 `conversation.chat.message.images` + `conversation.chat.user.images`，属改名）、`settings.about.mark`、`sidebar.account`、`sidebar.right.pane.tab.badge`、`sidebar.section.assignments`。

按「与 dsh 完全对齐」规则：dsh 插件可见的槽名必须一致，否则第三方插件注册即失败。本波先落插件管理页依赖的 `plugins.tab` 与 `plugins.detail.actions/badge/section`；其余槽（conversation/deliverables/settings/shell/sidebar-workspaces）的声明与宿主渲染面列为紧随其后的槽面对齐波次，逐槽按上游实现。

## 附录：「子代理」条目缺失的根因（2026-10-17 实锤）

内置插件配置的「子代理」卡片由 `ui-settings-plugins` 注册，门槛是 `configForms.whileServed(['subagent', 'subagent-model-selection'])`——两个设置命名空间必须都被服务。实测（桌面单用户形态复现）：`shell`/`agent-loop`/`web-search` 在（因为它们运行时显式 `settings.installSection`），而 **`subagent`（`SubagentRuntime.static Config`）与 `subagent-model-selection`（`SubagentModelSelectionConfig.static Config`）从未被服务**。

根因：**QiLin 的 settings 服务缺少 dsh 的 Config 投影机制**——上游 `packages/settings/settings` 有 `src/schema.ts`（`isVolatilePath`/`plainConfig`/`projectForm`/`volatileForm`，79 行）并把 `static Config`（含 volatile 字段）投影为设置文档的命名空间；QiLin 的同名服务缺 `schema.ts`，`index.ts` 相差 1081 行 diff（旧一代实现），因此这两类 `static Config` 永远不出现在设置文档里。

**修复工作流（对齐 dsh 机制，非打补丁）**：以上游为准移植 settings 服务的 `schema.ts` 与 `index.ts` 的投影差异，使 `static Config`（含 volatile）自动进入设置文档；随后「子代理」卡片按既有门槛自然出现。禁止用 installSection 之类的本仓注册机制打补丁（违反需求 A）。

## 附录：dsh 插件配置表单缺席的最终分析（第三方 dsh 插件，如 dsh-context）

用户实测：同一个 dsh 插件（dsh-context v0.69.1），上游 dsh 的插件详情页渲染出**完整配置表单**（入口位置、上下文洞察入口、编队标签页、视图默认值、系统提示词前缀……），麒麟的同页**没有任何表单**（只有组件、来源信息、当前版本）。

根因（实锤，非猜测）：两边的 settings 服务是**两代架构**。

- **上游 dsh**：`SettingsForms` 服务把**组合行服务的 `static Config`（schemastery）经 `resolveConfig` 自动投影**为设置文档的命名空间与表单——第三方 dsh 插件只要按 dsh 惯例导出 Config，表单就免费出现。
- **麒麟**：`SettingsProvider` 是**显式注册模型**（`installSection` / `SettingsScope` / `SettingsApplies: 'live'|'restart'`），从不投影第三方插件的 Config → 一切 dsh 插件的配置表单全部缺席。

同根因的已见症状：「子代理」卡片缺席（其两个命名空间从未被服务）、`git` 卡片缺席等。

**修复工作流（需求 A 的核心一刀）**：以上游 `packages/settings/settings` 为准移植——

1. 新增 `src/schema.ts`（`isVolatilePath` / `plainConfig` / `projectForm` / `volatileForm`，79 行）；
2. `src/index.ts` 对齐上游 `SettingsForms`（Config 投影、describe、表单编辑），以本仓 rescope 规则改写；
3. 迁移本仓消费者到新 API：`bash-local`、`pwsh-local`、`agent-loop`、`agent-default-model`、`llm-pi-ai`、`llm-deepseek-api-key`、`speech-to-text`、`plugin-market`、`plugin-inventory`、`settings-file`、`settings-controller`、`ui-settings*` 系列与其测试；
4. 验收：**装一个真实 dsh 插件（dsh-context），其配置表单在麒麟自动出现**，子代理卡片随之出现；tsc/lint/test:gui/coverage/doc 全绿。

## 附录：dsh-pet 实锤 —— 导出名兼容层缺失

第三方 dsh 插件 dsh-pet 安装后激活失败：`@deepseek-ai/dsh-home-paths does not provide an export named 'resolveDshHome'`。

结论：**specifier 兼容已存在**——`app-boot/src/profile-resolution/resolver.ts` 的 `dshCompatModuleId`/`translatedRequest` 会把 DSH 旧名路由到麒麟包目录（所以 import 能解析）；**缺的是导出名兼容**——本仓把公共导出改名（`resolveDshHome`→`resolveQilinHome`、`defaultDshHome`→`defaultQilinHome`、`DSH_HOME_DIR_NAME`→`QILIN_HOME_DIR_NAME`…），第三方插件按上游名取导出即失败。

**修复（不能遗漏一条）**：建立系统化清单与兼容层——

1. 以脚本对每个改名包做「上游导出名 vs 麒麟导出名」的全量差集（方法：解析两树入口的 export 声明；入口含 re-export 时递归跟随），生成清单文件入库（类似 no-unknown-casts.baseline.json）。
2. 每个上游名在麒麟包内以别名导出补齐（先例：icons 的 upstream-named alias 段、`IconCheckOutline16 as IconCheckOutlineRegular`），命名一律用上游原名。
3. 验收：dsh-pet、dsh-context 等真实 dsh 插件在麒麟安装→激活→配置表单全流程可用；清单零新增差集。

