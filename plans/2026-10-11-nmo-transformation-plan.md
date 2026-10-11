# NMO 对齐改造实施计划（QiLin 引擎）

日期：2026-10-11 · v2：按 3.1.4-rc.1 升级完成后的基线重新定位 · **v3：C2–C7 已拍板（C2=b，其余按推荐），计划定稿，待「开工」指令**
关联：[docs/nmo.md](../docs/nmo.md) · [docs/nmo.zh.md](../docs/nmo.zh.md)（理念正文，单一出处）

## 0. 定位与边界

- NMO 理念在上、产品在下：本仓是产品线的 Native 基座，本计划改造**引擎自身**的预设、工作台与门禁面。
- 本文件只做规划；每个切片（§4）开工时独立提交、独立验证、独立可回退。
- 基线：**v3.1.4-rc.1**（该 tag 即开工时的 HEAD，工作树干净）。upstream 0.2.1-alpha.2 对齐计划已收口（`plans/2026-10-10-upstream-0.2.1-alpha.2-alignment.md` §6.130），全量 test 已知红仅 2 例（subprocess-local Windows 平台专有 1 例、python-snapshot-workflow-order 两侧等价既有红 1 例）——S0 封存时登记，不追。

## 0.1 v2 改记（本次重分析对计划的实质影响）

| 升级期变化 | 对计划的影响 |
|---|---|
| `ui-sidebar-coding` 已整体删除（升级期破坏性 feat：编码/通用统一引擎原生右栏） | **C1 决策卡作废关闭**：内容体已按「删」落定；S3 面大幅缩小，不再含内容体删除 |
| 工作台标签**保留**，新增真实消费者：`ui-plugin-manager/admission.ts` 按 audience×active-tag 的插件准入门 | S3 必须处置 audience 数据模型与 UI（新决策卡 **C6**）；这是标签目前唯一不可直接删的理由 |
| ptc/cordis 预设随升级刷新：两预设都已引用 `workflow-ptc` 行；ptc 的 `tool-plugin-manager` 现为**无条件 disabled** | S1 合并清单更新；D-A3 的「档位表达式门」落在合并时重定，不再有现成写法可抄 |
| 新增 `QILIN_TOOLS_MODE` 进程级 env 缝（web-app patch tools 行，上游标注 TEMPORARY，等 per-session 选择落地后移除） | 登记为 T9（Native/Minimal 对账：进程级模式缝不外泄）；处置挂 S4，依赖说明见卡片备注 |
| 会话格式代次推进到 **v4**（新增 session-format-v3-to-v4；v4 扩展身份表含 `agent-preset/selected`） | S2 选型 b 的落点从泛指「下一代」明确为 **v4→v5**；v2→v3 改名先例锚点仍成立 |
| 升级线收口、工作树干净 | §0 旧「并行升级线协调/让路」条款删除；计划可在净树上直接开工 |

## 1. 决策基线

**已拍板（用户既定决策的引擎侧映射）**

| # | 决策 |
|---|---|
| D-A1 | 幸存预设 id = `ptc`（不换 id，保 KV 前缀与存量会话头兼容） |
| D-A2 | workflow 两行（tool-workflow / workflow-ptc）保持禁用——编排统一走 run_code，不并第二个模型可写编排面 |
| D-A3 | 创造模式三件全并入 ptc：tool-kylin 自省、customSkillDirs 创作技能、persona 创作段；tool-plugin-manager **启用**（C7=a；web 部署档如需关闭走部署 patch，不在预设层关） |
| D-A4 | 预设不在前端展示；后台运行，前端零预设面 |
| D-A5 | 存量会话迁移走「迁移入口 + 用户逐条确认」形态，引擎提供机制 |
| D-A6 | **双工作台模式删除**（2026-10-10 用户明示；S3 即其落点） |

**本轮拍板**（2026-10-11；§6 决策卡留档）

| # | 决策 |
|---|---|
| D-B1（C2） | 存量迁移走 **v4→v5 代次重写**，不做恢复期别名 fold；迁移入口与「用户逐条确认」照 D-A5 |
| D-B2（C3） | 合并预设**不在前端显示**，无内部显示名 |
| D-B3（C4） | 时序：**预设合并先行** → 工作台退化为纯准入 UI → 再删 |
| D-B4（C5） | cordis 三创作技能**随预设走**（presets/ptc/skills/），不升引擎级 |
| D-B5（C6） | audience **全部归 both**：删准入门、删受众设置 UI、删类型与写入口；存量记录的历史值不再被读取，**不批删记录** |
| D-B6（C7） | 合并版 ptc 的 tool-plugin-manager **启用**（承 D-A3，创造能力给全） |

## 2. 现状基线（v3.1.4-rc.1 实测锚点，本轮逐一重验）

| 事实 | 锚点 |
|---|---|
| 出厂预设三件：standard(order 1) / ptc(order 2) / cordis(order 4)；minimal 已删（order 缺 3） | `presets/*/preset.yml:3` |
| ptc 现有：tool-presentation mode:ptc；tool-plugin-manager **disabled: true**；workflow-ptc 行（无消费者注释）；tool-workflow 行 | `ptc/agent.cordis.yml:268-273, 277-279, 232-234, 240-241` |
| cordis 独有：tool-kylin；skill-filesystem customSkillDirs→skills/（三个创作技能目录）；tool-plugin-manager **启用**；persona 创作段 | `cordis/agent.cordis.yml:253-254, 265-267, 275-276` + `cordis/skills/` |
| 工作台标签状态机：默认映射 general→standard / coding→ptc；localStorage key `qilin.workbench.v1`；标签→预设绑定表；`workbenchShows`；rehydrate 只验形状不验 roster | `ui-workbench/workbench.ts:27, 31, 37-40, 57-59, 66-80` |
| 标签 UI：WorkbenchSwitch 行组件；hero 预设芯片（空白会话换预设） | `ui-workspace/rows/WorkbenchSwitch.tsx` · `ui-workspace/AgentPresetChip.tsx` + `contract/slots.ts:230-251` |
| 新任务按标签取预设；会话列表按标签过滤 + 空白会话跨标签改绑 | `ui-workspace/navigation.ts:221, 256-258` |
| **插件 audience 准入门**：audienceAdmits(both/general/coding × active)；包记录带 audience 字段；设置页可改（chooseAudience/setAudience） | `ui-plugin-manager/admission.ts:20-22, 33-74` · `manager-store.ts:96, 202, 435-437` · `PluginManagerPage.tsx` |
| 预设选择 GUI 已停用（行保留为依赖声明过门） | `web-app/cordis.patch.yml:433-435`（ui-agent-preset disabled） |
| 部署默认预设仍是 standard | `web-app/cordis.patch.yml:588` |
| `QILIN_TOOLS_MODE`(native/ptc/both) 进程级 env 缝，上游标注 TEMPORARY | `web-app/cordis.patch.yml:30-34` |
| 预设改名迁移先例：`'code'→'ptc'` 头 + selected 事件重写 | `session-format-v2-to-v3/migration.ts:18, 144`；现役代次 **v4** |
| ui-agent-opens / ui-schedule 的 src 已无 workbench 引用（编码认领路径随该 feat 改为无条件原生 Sidebar），package.json 依赖声明待清 | S4 清单 |
| e2e 车道（S0 封存对象）：agent-preset-authoring / agent-preset-selection / startup-auto-selection / shipped-composition / schedule-after / schedule-panel | `apps/web/tests/` |

## 3. NMO 对账总表（改造项 × 原则 × 消除的反例 × 验收口径）

| # | 改造项 | 服务 | 消除的反例（理念判据） | 验收口径 |
|---|---|---|---|---|
| T1 | 预设收敛 3→1（ptc 合并版） | M/O | 「让用户做系统可推断的选择」；能力按模式分支交付→组合一次给全 | roster 恰一条；合并件逐项在位 |
| T2 | 双工作台删除（含 audience 门处置） | M | 「流程堆叠 / 内部概念外泄」（标签、通用/编码 audience=预设知识进用户词汇表） | 标签 UI、状态机、过滤、admission 门零残留 |
| T3 | 默认钉 ptc + 残留自愈（localStorage/设置） | M | 「配置前置 / 首屏即设置」 | 全新 home 首启 0 配置项；旧残留自动归位 |
| T4 | 存量会话迁移机制 | N/M | 「关键事实失效即 resume 断」；迁移是门控决策非静默改写 | standard/cordis 头夹具迁移后 resume 100% |
| T5 | 前端零预设面清账（AgentPresetChip/slots/display 键/locales/文案/种子） | M | 内部概念不进用户词汇表 | 退役 id 在预设注册面与文案面零回流（常备 grep 门） |
| T6 | Open 门禁：装上即生效 + 可摘除 | O | 「只有读源码才能接入」「内置与扩展两套协议」 | 第三方样例零核心改动接入；摘官方插件核心存活 |
| T7 | Native 对账 | N | 事实落盘与重建 | 抽查 10 条会话事实 100% 可指位、可重建 |
| T8 | 文档对齐（preset.yml/README/指南/patch 注释） | O | 契约文档与实际不符 | 三预设旧表述、workbench-替代预设注释清零 |
| T9 | `QILIN_TOOLS_MODE` env 缝退役 | N/M | 进程级内部模式缝外泄为部署概念 | 单预设部署下 unset 与 set 行为一致；缝删除或登记上游依赖 |

## 4. 实施切片 S0–S6

依赖序：S0 → S1 → S2 → S3 → S4；S5/S6 可与 S3/S4 并行。**时序已定（C4=a）：预设合并先行**——合并后两标签指向同一预设，工作台退化成纯准入 UI，删除风险最小。

**S0 基线封存**（半天）
封存：§2 锚点快照、S0 表所列 6 条 e2e 车道清单、已知 2 红、audience≠both 的 bundle 清单（S3 处置面盘点）、typecheck 两面。产出基线文件挂本计划旁。不改产品代码。

**S1 预设合并**（引擎侧，2–3 天）
- `presets/ptc/agent.cordis.yml`：并入 tool-kylin、skill-filesystem customSkillDirs（+skills/ 目录随迁，C5=随预设走）、persona 创作段；tool-plugin-manager **启用**（C7=a，去掉 `disabled: true`）；workflow 两行维持 D-A2 禁用（workflow-ptc 行的「无消费者」注释随状态复核）。
- `presets/ptc/preset.yml`：order→1；显示名按 C3=不显示（预设不上前端，名称只留在文件与日志可读处）。
- 删 `presets/standard/`、`presets/cordis/`。
- `web-app/cordis.patch.yml:588` default: standard → ptc。
- 验证：shipped-root roster 断言 `['ptc']`；mount/composition/settings/discovery/display spec 重写后全绿；`--dump-config` 组合树断言（合并件在位、两退役 id 消失）。
- 回退：git revert 单提交。

**S2 存量会话迁移机制**（C2=b：v4→v5 代次重写，1–2 天）
- 照 `v2-to-v3/migration.ts:18,144` 先例新增 `session-format-v4-to-v5` 代次：`SESSION_FORMAT_VERSION` 5，头 + `agent-preset/selected` 事件双写点重写（v4 扩展身份表已含该事件类型，重写点现成）；**不做别名 fold**，resolve() 保持原 fail-loud 语义（agent.ts:381-394 不加兜底）。
- 迁移入口：引擎出 remote/命令面，产品壳复用「迁移窗口」形态（D-A5）——迁移是门控决策，不静默改写。
- 验证：合成夹具（standard/cordis/minimal 头 + selected 事件）迁移→resume 全通；未迁移旧头的拒绝路径有断言（不静默降级）；preset-migration 快照更新。

**S3 双工作台删除**（D-A6 落点，2–3 天；内容体已随升级删除，本片只剩标签面）
- `ui-workbench`：WORKBENCH_TAG_PRESETS / workbenchShows / 标签状态机 / WorkbenchSwitch 删除；STORAGE_KEY 处置 = bump v1→v2（旧键读取后弃用清理，防 :66-80 残留路径）。
- `ui-workspace/navigation.ts`：:221 create 不再 presetFor（省略走部署默认 ptc）；:256-258 标签过滤与空白会话改绑删除，列表回归单列。
- **audience 归一（C6=a）**：`ui-plugin-manager/admission.ts` 准入门删除；manager-store 的 audience 字段与 chooseAudience/setAudience 写入口删除；PluginManagerPage 受众选择 UI 删除；api-remotes 的 PluginAudience 类型删除；存量记录的历史 audience 键不再被读取、**不批删记录**（若要对账干净，另开一次性幂等归一到 both，不阻塞本片）。
- 验证：三包 spec 改写；e2e selection/startup-auto-selection 车道按「无标签、无预设选择面」重写；grep 门：`WORKBENCH_TAG`/`workbenchShows`/`audienceAdmits` 零残留。

**S4 残留与文案清账**（1 天）
- AgentPresetChip 与 slots.ts:230-251 契约下架；display.ts 内建键收敛；locales 三预设文案并一；guide/描述句；apps/web 'standard' 种子、shipped-composition 断言对齐；ui-agent-opens / ui-schedule 的 ui-workbench 依赖声明清理；patch :430-435「workbench tags replace them」注释段随事实重写。
- T9：`QILIN_TOOLS_MODE` 缝——若上游 per-session tool-presentation 已落地则删除；否则本部署 pin 后登记上游依赖，不留给部署当概念。
- 验证：新增常备 grep 门「退役预设 id（standard/cordis/minimal）在预设注册面与文案面零回流」，挂 test:docs。

**S5 Open 门禁**（并行，1–2 天）
- e2e A：第三方样例插件（新目录 fixture）全程不改核心、不读产品源码接入并被发现调用。
- e2e B：逐个摘除官方插件（抽样：ui-trajectory、tool-web），核心会话链路存活断言。

**S6 NMO 度量与文档收口**（并行，1 天）
- 度量脚本：全新 home 首启→首个会话可发送的步数（目标 ≤2：选目录→发消息）与首屏配置项数（目标 0）。
- 打断点审计表：逐一列现存 interrupt/approval 面，映射「用户在这里决策了什么」；答不出的登记整改。
- docs/nmo 增「本仓对账」附录：T1–T9 落地状态逐条对回 §3 表。

## 5. 验收断言

| # | 断言 |
|---|---|
| A1 | roster 恰一条 ptc；合并件（tool-kylin / customSkillDirs / persona 创作段 / plugin-manager 启用）逐项在位 |
| A2 | standard/cordis 头存量会话经 v4→v5 迁移后 resume 100%（夹具）；未迁移旧头的拒绝路径不静默降级 |
| A3 | 双工作台零残留：标签 UI、状态机、过滤、STORAGE_KEY 旧读路径、audience 门全部消失（grep 门） |
| A4 | 全新 home 首启：0 配置项、≤2 步到首个会话（e2e） |
| A5 | 预设选择面用户可见项 = 0（DOM 断言，含 hero 芯片） |
| A6 | 第三方样例零核心改动接入；官方插件可摘除核心存活（e2e 门） |
| A7 | 退役预设 id 预设面/文案面零回流（常备 grep 门） |
| A8 | `QILIN_TOOLS_MODE` unset 与 set 行为一致，或上游依赖已登记（T9 收口） |

## 6. 决策卡（已全部拍板 2026-10-11；本表留档）

| # | 卡 | 选项 |
|---|---|---|
| ~~C1~~ | ~~编码内容体去向~~ | **已关闭**：升级已按「整体删除」落定，标签仅存准入职责 |
| C2 | 存量迁移机制 | a) 恢复期别名 fold（最小、先行） b) v4→v5 代次重写（账面干净、动格式代次） c) a 先行 b 后补（推荐） **→ 取 b：v4→v5 代次重写，不做别名 fold** |
| C3 | 合并预设显示名（仅内部/日志可见） | 不显示（推荐，与 D-A4 一致） / 内部名「默认模式」/ 你定 **→ 取不显示** |
| C4 | 时序 | a) 预设合并先行→工作台成纯准入 UI 再删（推荐） b) 工作台先行 **→ 取 a** |
| C5 | cordis 三创作技能归宿 | 随预设走（presets/ptc/skills，推荐——复制预设即带走） / 升为引擎级 bundled 技能（动 customSkillDirs 语义与升级对账） **→ 取随预设走** |
| C6 | 标签删除后 audience（通用/编码受众）归一 | a) 全部归 both、删受众 UI 与 admission 门（推荐——单工作台下受众无意义） b) 字段与记录全删（最彻底，动持久化记录清洗） c) 字段保留恒 both（留僵尸面，不推荐） **→ 取 a：归 both、删门删 UI、不批删记录** |
| C7 | 合并版 ptc 的 tool-plugin-manager | a) 启用（承 D-A3 创造能力给全，web 档由部署 patch 关） b) 维持 disabled（最小预设，插件管理走 GUI 面） **→ 取 a：启用** |

## 7. 风险与让步登记

| 风险 | 处置 |
|---|---|
| 上游同步维护预设文件族，合并快照会漂移 | 每次引擎升级 diff 对账一次；S1 结构断言门钉「没写坏」，内容漂移人工审 |
| audience 是持久化在插件管理记录里的用户数据 | C6=a 已定：值不再被读、不批删记录；若要账面干净另开一次性幂等归一片，不阻塞 S3 |
| `QILIN_TOOLS_MODE` 依赖上游 per-session 选择落地节奏 | T9 允许「pin + 登记」的让步态，不阻塞其他切片 |
| e2e/快照重录量大 | 按片分批（S1 一批、S3 一批、S4 一批），不一次性重录 |
| 已知 2 红（平台专有 / 两侧等价）混入改造验证 | S0 封存基线时登记，验证时排除，不追不修 |

## 8. 状态

- 六卡已按拍板回填（§1 D-B、§6 留档）；切片细则按拍板定稿。

## 9. 执行进度

### S0 基线封存 —— 完成

产出 [plans/2026-10-11-nmo-s0-baseline.md](2026-10-11-nmo-s0-baseline.md)：仓库状态、两面 typecheck 均为 0、已知红、六条 e2e 车道、audience 处置面盘点（仓库内无静态声明，仅 profile 清单承载；本机两个 profile 均为空 ⇒ 门当前放行一切）、客户端残留面、退役 id 引用基线。

### S1 预设合并 —— 源码面落地

| 项 | 结果 |
|---|---|
| 合并内容 | `presets/ptc/agent.cordis.yml` 并入 `tool-kylin`、`skill-filesystem.customSkillDirs`（`skills/` 目录随 `git mv` 迁入 ptc）、创造 persona 全文；`tool-plugin-manager` 去掉 `disabled`（C7=a）；workflow 两行维持禁用（D-A2） |
| 退役 | `presets/standard/`、`presets/cordis/` 整目录删除；`ptc/preset.yml` 收敛为 `order: 1` + 说明，不发布显示名（C3） |
| 部署默认 | `bundle/web-app/cordis.patch.yml` `default: ptc` |
| 客户端出厂映射 | `ui-workbench` 两标签出厂记忆钉 `ptc`；rehydrate 边界把已退役 id 归位（随 S3 标签机制一并删除） |
| 文档 | `agent-presets` 与 `bundle/web-app` 双件 README 同步；pairing 已重录 |

**验证**：

| 面 | 结果 |
|---|---|
| `agent-presets` | **201/201** |
| `ui-workspace` / preset 相邻 7 包 | **236/236** · **737/737** |
| 全量 `vitest run` | **32489 通过**；257 红全部落在与本片无关的环境面（`ptc-runtime-python` 本机 python 3.9.6 不支持、`boot/hmr watch-config` 监听超时、`subprocess-local`/`windows-shell` 平台、`pdf-license-bundle`、`python-snapshot-workflow-order`）；其中 `apps/cli/tests/windows-shell.spec.ts` 的 2 例为本片引入，已改为单预设并复绿 |
| GUI 车道（`packages/client packages/host`） | **9106 通过**；本片引入的 3 红（`ui-workspace` 标签重绑断言）已按单预设事实重写并复绿 |
| 组合树 | `--dump-config` 显示 `agent-presets.default: ptc` |
| 门 | `verify-translation-pairing`（两文件）· `verify-runtime-closure`（**1 agent presets** + 156 包闭合）· `verify-cordis-config`（435 文件）· `verify-md-links`（2179 文件）· `verify-repository-references` · `rescope-vendor --check`（8464 文件）· `gen-plugin-packages --check` · `tsc -b` 两面 全绿 |
| `doc-quick` | 18 通过 / 2 红，均为**既有红**：`translation pairing`（`desktop/staging` 镜像 + `docs/tool-catalog.i18n.yaml` + python SDK 示例，均非本片文件）、`verify-repository-references`——后者本片一度被新计划文件里的裸 commit hash 触发，已按门规改写为 tag/描述 |

### S1 遗留收口 —— CLI 车道与产品硬编码（2026-10-11 续，提交 `5ccc5d93a3`）

**`apps/cli/tests/web-agent-presets.e2e.ts`：25 红 → 3 红（29/32 绿）**，改写口径：

| 改写点 | 事实依据 |
|---|---|
| 组合来源 | 出厂 `ptc` + 车道自建 lean 组合（`lane-lean`，只挂 `tool-bash`/`tool-pwsh`），取代已不存在的 `standard`/`minimal`/`cordis` 三档位；`minimal` 的内容断言（RL prompt、bash 描述）随预设删除，机制断言（宿主/预设服务归属、复制删除、默认设置、fork 继承）保留 |
| roster | system-trust 子集 == `['ptc']`，default `ptc` |
| 目录断言 | 补上合并后新增的三行：`run_code`（PTC 呈现注册）与部署级 `sidebar_open`/`working_directory`（全局层唯二成员，任何组合的会话都带） |
| skill 载入 | 直接 `execute('skill')` 现被 PTC 守卫拒绝并指向 `run_code`，断言据此改写；`skill-badge` 行已改为 opt-in bundle，车道自行 insert；出厂 `skills/` 路径 cordis→ptc |

**合并引入的产品缺陷（已修）**：创造模式在客户端三处硬编码已退役的 `cordis` —— [index.ts:163](../packages/client/ui-agent-preset/src/client/index.ts) stage、[CreatePluginMenuItem.tsx:33](../packages/client/ui-agent-preset/src/client/CreatePluginMenuItem.tsx) 与 [AgentPresetSection.tsx:215](../packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx) 的按钮门；单预设下该字符串永不命中，「用「创造模式」创作自定义预设」会静默消失。三处改为新内部常量 `SHIPPED_PRESET_ID`；[connection fixture](../packages/client/connection/src/client/fixture.ts) 的 roster 同步为单预设。

**验证**：CLI 车道 29/32；`ui-agent-preset`/`connection`/`ui-workbench`/`ui-workspace` **535/535**；`tsc -b tsconfig.client.json` 0；oxlint 0。

**三例既有红（升级期引入，非本片；读码确认根因）**：

| 例 | 根因 |
|---|---|
| applies the default-off subagent model allowlist only to new sessions | `settings namespace "subagent-model-selection-settings" is not registered`：web-app patch 已 insert 该行，但始终没有注册该 namespace |
| composes the intersection of installed Bundles and enabled preset rows | 子代理工具 schema 现为 `cwd`/`description`/`prompt`，不再是 `run_in_background` |
| applies a product-row edit only to later sessions on the preset | `subagent-codex/cordis.patch.yml` 自身 insert 了一行**启用**的 `tool-subagent-codex`，与「装 Bundle 不等于授予工具」的断言冲突 |

### S1 遗留 —— 浏览器车道（下一批）

| 面 | 实测状态 |
|---|---|
| `agent-preset-selection.e2e.ts` | 车道本机可跑（Playwright 正常，单车道约 150s）；当前探针 **2/9 绿**：`default: 'standard'`、`livePreset` 三档位期望、标签重绑与三份金样 |
| `agent-preset-authoring.e2e.ts` | 同因：`default: 'standard'`、读取已删除的 `shipped/standard/agent.cordis.yml`、四份金样、创造模式落地 id（现为 `ptc`） |
| `settings-chrome` / `preset-migration.snapshot` / `schedule-after` | 预设显示名断言与 `agentPreset: 'standard'` 种子 |

浏览器车道重写需**先重建前端 dist**（本轮改了 `ui-agent-preset` 与 `connection` 的客户端源码），再按单预设事实重推期望并重录 `expected/*.md`。

## 10. 下一步

浏览器车道重写 + 金样重录（重建前端 dist）→ S2 存量会话 v4→v5 代次重写（C2=b）→ S3 双工作台与 audience 归一删除。
