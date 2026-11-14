# 编码模式改名：ptc → coding

日期：2026-11-14
状态：已插入计划，待执行
触发：用户裁决——不再沿用 dsh 项目的命名设定，`ptc` 这一模式在我们这里就是**编码模式**（coding mode）。

## 1. 决定

1. 面向用户与驱动层的**模式标识**由 `ptc` 改为 `coding`：预置 id、默认模式、界面取词、分析事件取值、脚本入口、文档与配置目录全部随之改名。
2. 界面文案沿用现有中文名「编码模式」，英文用 **Coding mode**；不再出现 PTC 字样。
3. **运行层暂不改名**：`@qilin-agent/ptc-runtime`、`@qilin-agent/ptc-runtime-node`、`@qilin-agent/workflow-ptc`、`core/tools` 的 `mode: 'native' | 'ptc'`（工具呈现方式）保留现名。理由：包名属于发布家族，改名会牵动依赖图、发布校验与外部消费者；它与「用户选哪个模式」是两个概念。是否再把呈现方式也改名，另开切片（见 §6）。

## 2. 影响面（已盘点）

| 层 | 位置 | 现状 |
|---|---|---|
| 预置定义 | `packages/preset/agent-presets/presets/ptc/`（`preset.yml`：`name: 编码模式`，`order: 2`） | 目录名即 id |
| 预置常量 | `ui-agent-preset/src/client/shipped-preset.ts` 的 `SHIPPED_PRESET_ID = 'ptc'`；`ui-entry-customization` 的 `CREATOR_PRESET` | 硬编码 id |
| 分析事件 | `api/product-analytics/src/events.ts` 的 `AnalyticsPreset = 'creator' | 'ptc' | 'minimal' | 'standard'`；`ui-agent-preset` 与 `ui-conversation` 的映射 | 联合类型与映射 |
| 会话格式 | `SESSION_FORMAT_VERSION = 7`；`session-format-v2-to-v3`（`'code' → 'ptc'`）、`session-format-v4-to-v5`（退役 id → `'ptc'`） | 日志中的 `agentPreset` 存 `'ptc'` |
| 用户配置 | profile 的 `agent-presets` 配置 `default: ptc`（本机 `~/.qilin` 的租户 profile 就是如此） | 旧值会在 id 消失后成为无效引用 |
| 文档/脚本 | `docs/config-catalog.md`（生成）、`scripts/demo-ptc.mjs`、根 `package.json` 的 `demo:ptc`、各包 README 中英 | 需一并更新；`QILIN_TOOLS_MODE` 属呈现层，保留 |
| 测试/夹具 | `ui-agent-preset`、`session-controller`、snapshot 夹具与两套 SDK 期望输出 | 断言里出现 `'ptc'` |

## 3. 旧数据迁移（必须做，否则旧会话打不开）

- **会话头**：新增 `session-format-v7-to-v8`，把 `agentPreset: 'ptc'` 归一为 `'coding'`，`SESSION_FORMAT_VERSION` 提到 8；`docs/persistence-changes/historical-formats` 与 `session-format-catalog` 同步；两套 SDK 期望输出与 snapshot 夹具同批更新（`pnpm run test` 不覆盖，需跑 `test:snapshot` 与 SDK 期望）。
- **profile 配置**：`agent-presets` 解析 `default`/`agentPreset` 时接受只读别名 `ptc → coding`（启动即归一，不静默丢弃），并在 `config-catalog` 与 README 写明；不自动改写用户配置文件。
- **用户自建预置**：若用户目录里存在 id 为 `ptc` 的自建预置，与 shipped 冲突——保留「earlier root wins」现状，不改名。

## 4. 切片

| 片 | 内容 | 验收 |
|---|---|---|
| **S1 预置与常量** | `presets/ptc` → `presets/coding`；`SHIPPED_PRESET_ID`、`CREATOR_PRESET`、默认模式配置示例改 `coding`；界面取词「编码模式 / Coding mode」 | 预置清单出现 `coding`、不再出现 `ptc`；模式选择器与标题按钮文案正确；相关单测更新 |
| **S2 会话格式迁移** | `session-format-v7-to-v8`（`ptc → coding`）、版本号 8、历史格式文档、catalog | 旧日志 v7 读入后 `agentPreset` 为 `coding`；v8 新日志原样；迁移单测 + snapshot 夹具 |
| **S3 配置别名与目录** | `agent-presets` 的只读别名、`config-catalog` 生成、`docs` | 旧 profile `default: ptc` 仍能启动并按编码模式解析；无静默丢弃 |
| **S4 分析/脚本/文档** | `AnalyticsPreset` 取值、两个映射、`scripts/demo-ptc.mjs` → `demo-coding.mjs`、根脚本键、各包 README 中英 | 事件取值只剩 `coding`；`demo:coding` 可跑；`test:docs` 全绿 |
| **S5 收尾审计** | 全仓 `'ptc'` 残留清单（应仅剩运行层与历史迁移里的旧值）、两套 SDK 期望输出 | 残留逐条列明理由 |

## 5. 门禁

`pnpm run test:gui`、`npx tsc -b tsconfig.host.json`、`npx tsc -b tsconfig.client.json`、`pnpm run test:docs`、`pnpm run build`、配置目录重生成、`pnpm run test:snapshot`（夹具）、两套 SDK 期望输出、`pnpm run verify-translation-pairing --write`（改 README 后）。

## 6. 未决（执行前提请确认）

1. **运行层是否也改名**（`ptc-runtime` 包名、`mode: 'native' | 'ptc'`）？本计划建议保留，只改模式层；若要一并改，需要追加 S6（包改名 + 发布家族 + 依赖图 + 全量发布校验）。
2. **配置别名保留多久**：建议长期保留 `ptc → coding` 的只读别名（成本一行、用户零迁移），并在下个大版本评估移除。
