# NMO 改造 S0 基线封存

日期：2026-10-11 · 关联：[plans/2026-10-11-nmo-transformation-plan.md](2026-10-11-nmo-transformation-plan.md) §S0
本文件只记录**改造开工前冻结的事实**，供每个切片验证时比对；不改产品代码。

## 1. 仓库状态

| 项 | 值 |
|---|---|
| HEAD | `v3.1.4-rc.1` 的那个提交（`ci(release): keep desktop builds off the version tag`） |
| tag | `v3.1.4-rc.1` |
| 版本 | `3.1.4-rc.1` |
| 工作树 | 干净，唯一改动是计划文件 `plans/2026-10-11-nmo-transformation-plan.md` |

## 2. 两面 typecheck（开工前基线）

| 面 | 命令 | 退出码 |
|---|---|---|
| host 构建 | `npm run build:lib:host` | 0 |
| client 面 | `npx tsc -b tsconfig.client.json` | 0 |
| host 面 | `npx tsc -b tsconfig.host.json` | 0 |

## 3. 已知红（验证时排除，不追不修）

1. `packages/subprocess/subprocess-local` 平台专有 1 例（Windows 语义，macOS 不适用）；
2. `python-snapshot-workflow-order` 1 例（两侧等价既有红）。

## 4. e2e 车道清单（`apps/web/tests/`）

六条：`agent-preset-authoring.e2e.ts` · `agent-preset-selection.e2e.ts` · `startup-auto-selection.e2e.ts` · `shipped-composition.e2e.ts` · `schedule-after.e2e.ts` · `schedule-panel.e2e.ts`（均在 `apps/web/tests/`，跑 `test:web` 车道）。
辅助面：`scaffold.ts:585 default: 'standard'`、`support.ts:68 presets: { general: 'standard', coding: 'ptc' }`（S1 已改为 ptc）。
另有一条同族但属 `test:e2e` 车道的 node 车道：`apps/cli/tests/web-agent-presets.e2e.ts`（S0 封存时**已红**：其 roster 断言仍要求已删除的 `minimal`）。

## 5. audience 处置面盘点（S3 用）

| 项 | 事实 |
|---|---|
| 声明处 | 仓库内**无**任何 `audiences` 静态声明；记录只写进 profile 清单 `package.json → qilin.profile.audiences` |
| 写入方 | `boot/plugin-manager`: `setAudience`(:548)、`selectBundle`(:820)、`writeAudience`(:854)；安装默认 `audience: 'both'`（`manager-store.ts:558`），不随活动标签写入 |
| 读取方 | 仅 `client/ui-plugin-manager/src/client/admission.ts` 的渲染准入门（`installAdmission`） |
| 本机现状 | `~/.qilin/profiles/web/package.json` 无该字段；`profiles/qilin/package.json` 为 `{}` ⇒ 门当前**放行一切**，归一零用户可见变更 |
| 类型面 | `PluginAudience`（`api-remotes/client`）· `boot/plugin-manager/src/types.ts:80-81,163` · `util/package-manifest/src/types.ts:66` |

## 6. 存量残留面（S1 立刻会碰到的两处）

| 面 | 现状 | S1 处置 |
|---|---|---|
| 会话头 | 当前代次 **v4**，本机 1 条会话（`--Users-libing-kk_Projects-deepseek-harness--`，`session.v4.jsonl.zstd`） | 不动；S2 走 v4→v5 代次重写 |
| 客户端 localStorage | `qilin.workbench.v1`，`presets: { general: 'standard', coding: 'ptc' }`，rehydrate 只验形状不验 roster | S1 把出厂映射钉到 ptc，并在 rehydrate 边界做退役 id 归位（随 S3 标签机制一并删除） |

## 7. 退役 id 引用基线（供 S4 常备 grep 门对照）

范围：`packages apps docs scripts snapshots .agents/notes .github`（排除 `node_modules`/`lib`）。

| 模式 | 命中行数 |
|---|---|
| `presets/standard` | 4 |
| `presets/cordis` | 9 |
| `WORKBENCH_TAG_PRESETS` | 9 |
| `audienceAdmits` | 11 |
| `qilin.workbench.v1` | 4 |
| `QILIN_TOOLS_MODE` | 13 |

## 8. 出厂 roster（S1 改造对象）

`presets/standard`（order 1，标准模式）· `presets/ptc`（order 2，编码模式）· `presets/cordis`（order 4，创造模式）。
三者的 `agent.cordis.yml` 逐行差异已核对：cordis = ptc 基线 + `tool-kylin` + `skill-filesystem.customSkillDirs`（`skills/`）+ `tool-skill` 移到该处 + `tool-plugin-manager` 启用 + 创作 persona + workflow 两行**未禁用**；standard = ptc 去掉 `tool-presentation: ptc` 并把 workflow 两行放开。
