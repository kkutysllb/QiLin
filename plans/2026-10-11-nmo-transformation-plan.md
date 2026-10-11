# NMO 对齐改造实施计划（QiLin 引擎）

日期：2026-10-11 · 状态：**草案，待拍板 §6 决策卡后开工** · 本轮零代码改动
关联：[docs/nmo.md](../docs/nmo.md) · [docs/nmo.zh.md](../docs/nmo.zh.md)（理念正文）；KCoder 侧产品策略层合并（其 D4）为本计划引擎化的先声。

## 0. 定位与边界

- NMO 理念在上、产品在下：本仓是产品线（KSRW / KCoder / JiuZhang …）的 Native 基座，本计划改造**引擎自身**的预设、工作台与门禁面。
- 本文件只做规划；每个切片（§4）开工时独立提交、独立验证、独立可回退。
- 与并行升级线（upstream 0.2.1-alpha.2 对齐，B4/B5 在飞）的协调：本计划全部切片落在 `packages/preset/agent-presets`、`packages/client/ui-workbench`、`packages/client/ui-workspace`、`packages/bundle/web-app`、apps/web 测试面——与升级线重叠的文件（profile.ts、remote-events.ts、tsconfig*）为零；撞车时本计划让路、后行 rebase。

## 1. 决策基线

**已拍板（用户既定决策的引擎侧映射）**

| # | 决策 |
|---|---|
| D-A1 | 幸存预设 id = `ptc`（不换 id，保 KV 前缀与存量会话头兼容） |
| D-A2 | workflow 两行（tool-workflow / workflow-ptc）保持禁用——不并第二个模型可写编排面，编排统一走 run_code |
| D-A3 | 创造模式三件全并入 ptc：tool-kylin 自省、customSkillDirs 创作技能、persona 创作段；tool-plugin-manager 沿档位表达式门（桌面档启用、web 档不暴露） |
| D-A4 | 预设不在前端展示；后台运行，前端零预设面 |
| D-A5 | 存量会话迁移走「迁移入口 + 用户逐条确认」形态，引擎提供机制 |
| D-A6 | **双工作台模式删除**（2026-10-10 用户明示；本计划的 S3 即其落点） |

**待拍板**：见 §6 决策卡 C1–C5。

## 2. 现状基线（HEAD 实测锚点）

| 事实 | 锚点 |
|---|---|
| 出厂预设三件：standard(order 1) / ptc(order 2) / cordis(order 4)；minimal 已删（order 缺 3） | `presets/*/preset.yml:3` |
| 双工作台状态机：默认状态、localStorage key `qilin.workbench.v1`、标签→预设绑定表、会话列表过滤 | `ui-workbench/workbench.ts:25,31,37,57-59` |
| rehydrate 只验形状不验 roster——旧值残留会把退役 id 送进 create | `workbench.ts:67-78` |
| 新任务带预设 / 会话过滤按标签 | `ui-workspace/navigation.ts:221,257` |
| 预设选择 GUI 已停用 | `web-app/cordis.patch.yml:433-435`（ui-agent-preset disabled） |
| 部署默认预设仍是 standard | `web-app/cordis.patch.yml:588` |
| 会话创建/恢复走 composeAgent→resolve，未知 id 抛错、无静默回落 | session-controller agent.ts（resolve 链） |
| 预设改名的迁移先例：`'code'→'ptc'` 头+selected 事件重写 | `session-format-v2-to-v3/migration.ts:18,144` |

## 3. NMO 对账总表（改造项 × 原则 × 消除的反例 × 验收口径）

| # | 改造项 | 服务 | 消除的反例（理念判据） | 验收口径 |
|---|---|---|---|---|
| T1 | 预设收敛 3→1（ptc 合并版） | M/O | 「让用户做系统可推断的选择」；能力按模式分支交付→改为组合一次给全 | roster 恰一条；合并四件逐项在位 |
| T2 | 双工作台删除 | M | 「流程堆叠 / 内部概念外泄」（标签=预设知识进了用户词汇表） | 标签 UI、绑定表、过滤逻辑零残留 |
| T3 | 默认钉 ptc + 残留自愈（localStorage/设置） | M | 「配置前置 / 首屏即设置」 | 全新 home 首启 0 配置项；旧残留自动归位 |
| T4 | 存量会话迁移机制 | N/M | 「关键事实失效即 resume 断」；迁移是门控决策非静默改写 | standard/cordis 头夹具迁移后 resume 100% |
| T5 | 前端零预设面清账（display 键/locales/文案/种子） | M | 内部概念不进用户词汇表 | 退役 id 在预设注册面与文案面零回流（常备 grep 门） |
| T6 | Open 门禁：装上即生效 + 可摘除 | O | 「只有读源码才能接入」「内置与扩展两套协议」 | 第三方样例零核心改动接入；摘官方插件核心存活 |
| T7 | Native 对账 | N | 事实落盘与重建 | 抽查 10 条会话事实 100% 可指位、可重建 |
| T8 | 文档对齐（preset.yml/README/指南） | O | 契约文档与实际不符 | 四预设/三预设旧表述清零（已见并行线修掉一处） |

## 4. 实施切片 S0–S6

依赖序：S0 → S1 → S2 → S3 → S4；S5/S6 可与 S3/S4 并行。**推荐时序：预设合并先行**（合并后两标签指向同一预设，双工作台退化成纯 UI，删除风险最小；即 C4 选 a，见 §6）。

**S0 基线封存**（半天）
记录当前门禁面快照：agent-presets 包 spec 清单、apps/web selection/authoring/shipped-composition/schedule-after e2e 清单、typecheck 两面。产出基线文件挂本计划旁。不改产品代码。

**S1 预设合并**（引擎侧，2–3 天）
- `presets/ptc/agent.cordis.yml`：并入 D-A3 四件；workflow 两行维持 D-A2 禁用；delegation isolate 组结构不动。
- `presets/cordis/skills/` 三个创作技能目录迁至 `presets/ptc/skills/`（customSkillDirs 指向随迁；追加语义，默认技能根不丢）。
- `presets/ptc/preset.yml`：order→1，文案改写（显示名按 C3）。
- 删 `presets/standard/`、`presets/cordis/`。
- `web-app/cordis.patch.yml:588` default: standard → ptc。
- 验证：shipped-root roster 断言改 `['ptc']`；mount/composition/settings/discovery/display spec 重写后全绿；`--dump-config` 组合树断言（合并四件在位、两退役行消失）。
- 回退：git revert 单提交。

**S2 存量会话迁移机制**（按 C2 选型，1–2 天）
- 选型 a（恢复期别名）：agent-presets resolve() 加 legacy fold（standard/cordis→ptc），日志不改；改动最小，先保 resume 不断。
- 选型 b（迁移代次重写）：照 `migration.ts:18,144` 先例扩一代或并入下一代格式迁移，头+selected 事件双写点；账面干净。
- 迁移入口：引擎出 remote/命令面，产品壳复用 KCoder 已验证的「迁移窗口」UI 形态（D-A5）。
- 验证：合成夹具（standard/cordis/minimal 头 + selected 事件）迁移→resume 全通；preset-migration 快照更新。

**S3 双工作台删除**（D-A6 落点，2–3 天）
- `ui-workbench`：WORKBENCH_TAG_PRESETS / workbenchShows / 标签状态机删除；STORAGE_KEY 处置 = bump v1→v2（旧键读取后弃用清理，防 :67-78 残留路径）。
- `ui-workspace/navigation.ts:221`：create 不再带 presetFor——省略走部署默认 ptc；`:257` 标签过滤删除，会话列表回归单列。
- 右栏内容体按 **C1** 处置（删 / 降级为普通右栏面板 / 另定）。
- 验证：两包 spec 改写；e2e selection 车道按「无预设选择面」重写；grep 门：`WORKBENCH_TAG_PRESETS` 等零残留。

**S4 残留与文案清账**（1 天）
- display.ts 内建键收敛；两处 locales 三预设文案并一；guide/描述句；apps/web scaffold/support 的 'standard' 种子、schedule-after seed、shipped-composition 断言对齐。
- 验证：新增常备 grep 门「退役预设 id（standard/cordis/minimal）在预设注册面与文案面零回流」，挂 test:docs。

**S5 Open 门禁**（并行，1–2 天）
- e2e A：第三方样例插件（新目录 fixture）全程不改核心、不读产品源码接入并被发现调用。
- e2e B：逐个摘除官方插件（抽样：ui-trajectory、tool-web），核心会话链路存活断言。
- 产出：Open 两条验收从口号变门禁。

**S6 NMO 度量与文档收口**（并行，1 天）
- 度量脚本：全新 home 首启→首个会话可发送的步数（目标 N=2：选目录→发消息）与首屏配置项数（目标 0）。
- 打断点审计表：逐一列现存 interrupt/approval 面，映射「用户在这里决策了什么」；答不出的登记整改。
- docs/nmo 增「本仓对账」附录：T1–T8 落地状态逐条对回 §3 表。

## 5. 验收断言（对齐理念可测量口径）

| # | 断言 |
|---|---|
| A1 | roster 恰一条 ptc；合并四件（tool-kylin / customSkillDirs / persona 创作段 / plugin-manager 档位门）逐项在位 |
| A2 | standard/cordis 头存量会话经迁移后 resume 100%（夹具）；无迁移入口时走别名 fold 不 fail-loud |
| A3 | 双工作台零残留：标签 UI、绑定表、过滤、STORAGE_KEY 旧读路径全部消失（grep 门） |
| A4 | 全新 home 首启：0 配置项、≤2 步到首个会话（e2e） |
| A5 | 预设选择面用户可见项 = 0（DOM 断言） |
| A6 | 第三方样例零核心改动接入；官方插件可摘除核心存活（e2e 门） |
| A7 | 退役预设 id 预设面/文案面零回流（常备 grep 门） |

## 6. 决策卡（待拍板，报编号即可）

| # | 卡 | 选项 |
|---|---|---|
| C1 | 双工作台删除后，编码内容体（ui-sidebar-coding）去向 | a) 随工作台整体删除（最彻底） b) 降级为普通右栏面板（保能力、入口收敛） c) 暂留隐藏（不推荐，僵尸面） |
| C2 | 存量迁移机制 | a) 恢复期别名 fold（最小、先行） b) 迁移代次重写（账面干净、动格式代次） c) a 先行 b 后补（推荐） |
| C3 | 合并预设显示名（仅内部/日志可见） | 不显示（推荐，与 D-A4 一致） / 内部名「默认模式」/ 你定 |
| C4 | 时序 | a) 预设合并先行→工作台成纯 UI 再删（推荐） b) 工作台先行 |
| C5 | cordis 三创作技能归宿 | 随预设走（presets/ptc/skills，推荐——复制预设即带走） / 升为引擎级 bundled 技能（影响 customSkillDirs 语义与升级对账） |

## 7. 风险与让步登记

| 风险 | 处置 |
|---|---|
| 上游同步维护预设文件族，合并快照会漂移 | 每次引擎升级 diff 对账一次；S1 的结构断言门钉「没写坏」，内容漂移人工审 |
| 双工作台删除波及 ui-sidebar-coding 与 audience 语义 | C1 先拍板再动 S3；选 a 则连带清理面大，单独成片 |
| e2e/快照重录量大 | 按片分批（S1 一批、S3 一批、S4 一批），不一次性重录 |
| 并行升级线在飞改动（cot-translation、profile.ts 等） | 本计划文件面与其零重叠；撞车时本计划让路 |

## 8. 状态

- 本计划落盘即本轮全部动作；**零代码改动、零提交**。
- 工作树当前由并行升级线占用（experimental/cot-translation、remote-events、profile.ts、tsconfig* 等），未触碰。
