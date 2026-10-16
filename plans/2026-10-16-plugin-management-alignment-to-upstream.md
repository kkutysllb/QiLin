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
| 子智能体条目 | 相关提交 `640e28cd94`（重组插件设置 + 实验目录页 #5922）与 `259534c2c7`（中文页改名「子智能体」）——**重组/改名，未删除** | 条目形态停在重组前 |

## 二、决策（已拍板，执行时按此）

1. **行级配置表单不要**：删除 `RowConfigForm.*`、`plugins.row.config` 插槽声明，并同步移除其消费侧文档与测试（`packages/extensions/kylin-client-runner/src/client/slot-catalog.ts` 的该槽条目、`ui-plugin-manager` 相关用例）。
2. **移植 `ui-plugin-market`**：Discover 标签页、自定义市场源与安装流一并进来，含其在组合包中的行与依赖声明。
3. **子智能体条目跟随上游重组后的位置**（设置内重组形态），不自创独立形态。

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
