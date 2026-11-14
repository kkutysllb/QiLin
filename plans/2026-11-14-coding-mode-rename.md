# 编码模式改名：ptc → coding

日期：2026-11-14
状态：已插入计划，待执行
触发：用户裁决——不再沿用 dsh 项目的命名设定，`coding` 这一模式在我们这里就是**编码模式**（coding mode）。

## 1. 决定

1. 面向用户与驱动层的**模式标识**由 `coding` 改为 `coding`：预置 id、默认模式、界面取词、分析事件取值、脚本入口、文档与配置目录全部随之改名。
2. 界面文案沿用现有中文名「编码模式」，英文用 **Coding mode**；不再出现 coding 字样。
3. **运行层一并改名**（2026-11-14 追加裁决）：执行层（包名、服务名、工具呈现方式取值、环境变量取值）全部由 `coding` 改为 `coding`，见 §7。dsh 的命名不再保留。

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
- **用户自建预置**：若用户目录里存在 id 为 `coding` 的自建预置，与 shipped 冲突——保留「earlier root wins」现状，不改名。

## 4. 切片

| 片 | 内容 | 验收 |
|---|---|---|
| **S1 预置与常量** | `presets/ptc` → `presets/coding`；`SHIPPED_PRESET_ID`、`CREATOR_PRESET`、默认模式配置示例改 `coding`；界面取词「编码模式 / Coding mode」 | 预置清单出现 `coding`、不再出现 `coding`；模式选择器与标题按钮文案正确；相关单测更新 |
| **S2 会话格式迁移** | `session-format-v7-to-v8`（`ptc → coding`）、版本号 8、历史格式文档、catalog | 旧日志 v7 读入后 `agentPreset` 为 `coding`；v8 新日志原样；迁移单测 + snapshot 夹具 |
| **S3 配置别名与目录** | `agent-presets` 的只读别名、`config-catalog` 生成、`docs` | 旧 profile `default: ptc` 仍能启动并按编码模式解析；无静默丢弃 |
| **S4 分析/脚本/文档** | `AnalyticsPreset` 取值、两个映射、`scripts/demo-ptc.mjs` → `demo-coding.mjs`、根脚本键、各包 README 中英 | 事件取值只剩 `coding`；`demo:coding` 可跑；`test:docs` 全绿 |
| **S5 收尾审计** | 全仓 `'ptc'` 残留清单（应仅剩运行层与历史迁移里的旧值）、两套 SDK 期望输出 | 残留逐条列明理由 |

## 5. 门禁

`pnpm run test:gui`、`npx tsc -b tsconfig.host.json`、`npx tsc -b tsconfig.client.json`、`pnpm run test:docs`、`pnpm run build`、配置目录重生成、`pnpm run test:snapshot`（夹具）、两套 SDK 期望输出、`pnpm run verify-translation-pairing --write`（改 README 后）。

## 6. 未决（执行前提请确认）

1. **配置别名保留多久**：建议长期保留 `ptc → coding` 的只读别名（成本一行、用户零迁移），并在下个大版本评估移除。（运行层是否改名已裁决：一并改，见 §7。）
## 7. 运行层改名（追加裁决：包名一起改）

### 7.1 命名映射

| 现名 | 新名 | 说明 |
|---|---|---|
| `@qilin-agent/coding-runtime`（`packages/coding-runtime/coding-runtime`） | `@qilin-agent/coding-runtime`（`packages/coding-runtime/coding-runtime`） | 执行 seam 服务 `ctx.codingRuntime` → `ctx.codingRuntime` |
| `@qilin-agent/coding-runtime-node` | `@qilin-agent/coding-runtime-node` | Node 后端实现 |
| `@qilin-agent/workflow-coding` | `@qilin-agent/workflow-coding` | 该族的 workflow 工具 |
| `@qilin-agent/experimental-coding-runtime-python` | `@qilin-agent/experimental-coding-runtime-python` | 实验性 CPython 后端 |
| 分组目录 `packages/coding-runtime/` | `packages/coding-runtime/` | 连同分组 README、`packages/README.md`、根 `AGENTS.md` 布局表 |
| 工具呈现取值 `mode: 'native' | 'ptc'`（`core/tools`、`core/agent-tool-presentation`） | `mode: 'native' | 'coding'` | 默认仍 `native` |
| 环境变量取值 `QILIN_TOOLS_MODE=native|ptc` | `QILIN_TOOLS_MODE=native|coding` | 变量名不变，只改取值 |

### 7.2 影响面（已实测的引用文件数）

| 目标 | 引用文件数 |
|---|---|
| `@qilin-agent/coding-runtime` | 95 |
| `@qilin-agent/coding-runtime-node` | 40 |
| `@qilin-agent/workflow-coding` | 32 |
| `mode` 取值（`core/tools` + `agent-tool-presentation` + `bundle`） | 112 处 |

不改的部分（豁免清单）：`.desktop-build`（生成物）、`.agents/notes/implemented|archived`（已冻结）、`docs/persistence-changes/historical-formats`（历史格式事实）、`packages/experimental/cua-macos` 中的派生内容（执行前先判定归属，属生成物则加入豁免）。

### 7.3 执行顺序

| 片 | 内容 | 验收 |
|---|---|---|
| **S6 包改名（机械层）** | `git mv` 三个包目录与分组目录；改 `package.json` 的 `name` 与依赖引用；改全部模块说明符；改 tsconfig `references`；改 cordis 配置 `name:`；`ctx.codingRuntime` → `ctx.codingRuntime` 及模块增补声明 | `pnpm install` 成功、两套 `tsc -b` 干净、`pnpm run build` 通过、`verify-package-meta` / `verify-package-dependencies` / `publint` 干净 |
| **S7 呈现方式取值** | `mode` 联合类型与默认值、`QILIN_TOOLS_MODE` 解析、bundle 注释、受影响提示与测试 | 取值只剩 `native`/`coding`；旧值 `coding` 报未知取值而非静默回落；相关单测与快照更新 |

### 7.4 追加门禁

`pnpm run test:gui`、`pnpm run test:snapshot`、两套 SDK 期望输出、`pnpm run doc-sync`、`pnpm run gen-config-catalog`、`pnpm run verify-package-meta`、`pnpm run verify-package-dependencies`、`pnpm run publint`、`pnpm run verify-cordis-config`、`pnpm run verify-translation-pairing --write`（三个包 README 中英 + 分组 README）。

### 7.5 落地情况（2026-11-14）

| 项 | 结果 |
|---|---|
| 包目录与包名 | `packages/coding-runtime/{coding-runtime,coding-runtime-node}`、`packages/workflow/workflow-coding`、`packages/experimental/coding-runtime-python`；四个包名同步改名 |
| 服务名 | `ctx.ptcRuntime` → `ctx.codingRuntime`（含字面服务名 `'ptcRuntime'`） |
| 呈现取值 | `ToolPresentationMode = 'native' | 'coding'`；`QILIN_TOOLS_MODE` 只接受 `native`/`coding`；headless bundle 默认 `coding` |
| 文档 | 子系统页 `docs/subsystems/coding-runtime.md`（+zh）改名；`type-equiv` 文档块与源码 JSDoc 同步；配置目录重生成；受影响的中英 README 与 Agent Notes 重新配对 |
| 未改（留存词汇） | 事件类型 `tool/ptc-dispatch*`（持久化词汇）、类型名 `CodingRuntime`/`CodingRunRequest`/`CodingRunResult`、文件 `packages/core/tools/src/coding.ts`、README 正文里的 `coding` 概念词、历史 Agent Note 的文件名与正文——改名只覆盖包名/服务名/呈现取值 |

### 7.6 残留收口与发布安排（2026-11-14 续）

- **残留收口已落地**：公开类型名 `PtcRuntime`/`PtcRunRequest`/`PtcRunResult` 等改为 `Coding*`；`packages/core/tools/src/ptc.ts` → `coding.ts`（含 spec 与演示脚本 `scripts/demo-coding.mjs`、根脚本 `demo:coding`）；README 与子系统文档里的 PTC 措辞改为 coding mode / coding runtime；472 个 `type-equiv` 文档块随源码同源更新。
- **仍保留**：持久化事件类型 `tool/ptc-dispatch*` 与扩展点 `tools/ptc-dispatch-log`（属格式/扩展词汇，改名需再进位一次会话格式）；`.agents/notes/**` 历史记录的正文与文件名（只更新了指向已移动文件的链接）。
- **发布安排（用户裁决）**：等其余计划全部完成后再发布；版本号暂定 **3.1.12**（patch），不做大版本跨越；发布时再打 tag 并写 release notes，同时把 v7 记录里的 `source: tag qilin-v3.2.0` 改为实际使用的 tag。

### 7.7 风险

- **发布家族**：改名等于新包名首发，版本号与 release notes 必须同批；`release:verify-published` 会要求新名在 registry 上存在。
- **服务名**：`ctx.codingRuntime` 是 seam 名，改名后引用旧名的外部插件失效（仓库内全同步改；外部消费者属预发布 API，允许破坏）。
- **旧 profile**：`QILIN_TOOLS_MODE=ptc` 的旧配置按「misconfiguration fails loud」报错，并在 §3 的别名机制里同时接受 `coding`。
