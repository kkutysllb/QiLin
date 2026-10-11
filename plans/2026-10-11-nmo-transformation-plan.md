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

### S1 遗留收口 —— CLI 车道与产品硬编码（2026-10-11 续）

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

### S1 遗留收口 —— 浏览器车道（2026-10-11 续，第二批）

**先修掉一个阻断一切 profile-less 组合的真缺陷**：合并后的 `ptc` 启用 `tool-plugin-manager`（C7=a），而该工具背后的 `pluginManager` 服务只在**有 profile 的组合**里存在（base bundle 的 `plugin-manager` 行同为 `!!js "!ctx.get('profileContext')"`）。没有 profile 时该服务永不到达 → 行永远 pending → **该组合下每个会话都无法组合**：`agent-preset/invalid: preset "ptc" failed to mount: 1 row(s) did not activate: tool-plugin-manager ... waiting for pluginManager`。实测波及与预设无关的车道（`startup-auto-selection`、`composer-placeholder` 均在「连上工作区后编辑器不解锁」这一步红）。修法：预设行补同一条判据 `disabled: !!js "!ctx.get('profileContext')"`（[agent.cordis.yml](../packages/preset/agent-presets/presets/ptc/agent.cordis.yml)）。验证：profile-less 组合的 `session/create` 恢复 `ok` 并组合出 `agentPreset: "ptc"` 的空白会话（探针实测）；profile-backed 的 CLI 车道 `composes the full agent from ptc` 仍断言 `plugin_manager` 在目录里（1/1 绿）；`verify-cordis-config` 435 文件、`verify-runtime-closure` 1 预设 + 156 包闭合。

| 车道 | 结果 |
|---|---|
| `startup-auto-selection.e2e.ts` | **2/2 绿**（无改动；此前的红即上述缺陷） |
| `composer-placeholder.e2e.ts`（对照，与预设无关） | **1/1 绿** |
| `agent-preset-authoring.e2e.ts` | **7/7 绿**：`default: 'ptc'`；查看/删除/复制改名 `编码模式`；读 `presets/ptc` 组合；复制件描述按 `ptc/preset.yml` 现值；创造模式落地 id `ptc`。金样重录 3 份（section/created/damaged；copy-dialog 未变） |
| `agent-preset-selection.e2e.ts` | **5/5 绿**（改写口径见下） |

**selection 车道改写口径**：hero 的 run-mode 芯片是 **ui-workspace 的重复实现**（[AgentPresetChip.tsx](../packages/client/ui-workspace/src/client/AgentPresetChip.tsx)，即 D-A4/S4 的下架对象）——它用 `preset.name ?? id` 取名（不本地化，与 `agent-presets/display` 那套分叉），且 `options.length < 2` 时整块不渲染（注释原文：a selector over one entry is noise）。S1 去掉 `ptc/preset.yml` 显示名后它显示裸 id `ptc`；单预部署下它根本不渲染。车道据此断言：hero **没有** run-mode 按钮、settings 区仍以本地化名 `Coding mode` 报出 roster 与默认、可用性开关 off/on、header 标签。删掉的三例（staging pick、refusal banner、slash catalog 跟随组合）前提都是「多档位切换」，切换对象已不存在；标签重绑一例随 S3 退场（fold 由 `ui-workbench` 单测覆盖）。金样：hero 重录，`menu.expected.md` 删除。

**本批未收口（如实登记）**：

| 面 | 状态 |
|---|---|
| `shipped-composition.e2e.ts` | ~~5 红~~ → **第三批收口 6/7，见下** |
| `preset-migration.snapshot.ts` | 断言含 `['ptc','standard','ptc']`，是 S2 的迁移面本体，随 v4→v5 代次重写一并处置 |
| `schedule-after.e2e.ts` | ~~种子待改~~ 种子已改 `ptc`；**第三批探明为升级期孤儿车道，见下** |
| `settings-chrome.e2e.ts` | 无需改：命中的 `standard` 是 `ui-chat transcriptView` 取值，与预设无关 |

### S1 遗留收口 —— shipped-composition 6/7 与 schedule 车道探明（第三批）

**`shipped-composition.e2e.ts`：5 红 → 1 红（6/7 绿）**，四例按「PTC 直调门拦在一切之前」同根改写：

| 例 | 改法 |
|---|---|
| assembles…defaults | 两层陈旧：全局层断言补 `working_directory`（与 `sidebar_open` 并列的部署级成员）；`EXPECTED_TOOLS` 名册本身从升级期就 stale（`pwsh` 被 Web 部署 patch 禁用、`workflow` 面已退役、新增 `run_code`/`working_directory`/`cordis_inspect_list`/`cordis_inspect_query`）——此前从未执行到该断言（全局层断言先红） |
| background-job registry | producer 三次直调（`bash`/`job_list`/`job_output`）全部改经 `run_code` 嵌套派发；断言从 bash 的渲染文本改为 run_code 输出（`jobId`/`id [kind]`/`.text`），registry 归属不变 |
| Auto request 3→2 | 脚本化 producer 改发 `run_code`（程序内嵌套 `tools.bash` 删除并 catch 拒绝消息）——auto-review **刻意放行外层 transport、仍拦截嵌套调用**（[auto-review/src/index.ts:4](../packages/experimental/auto-review/src/index.ts) 注释与 pending-PTC 校验在先），故三请求编排、review 名 `bash`、拒绝文案、脱敏断言全部保留；主面 roster 断言收紧为恰 `[run_code]` |
| rollback sentinel | 直调 `write` 改经 `run_code` 嵌套；集成回滚后无拦截器，sentinel 照写 |

**登记不修：`reviews one-shot, continuable, and cold-resumed in-process child calls`（rc.1 上即红，升级期孤儿）**。三层根因：① 升级退役 `backgroundMode`（[tool-subagent Config](../packages/subagent/tool-subagent/src/index.ts) 已无此字段，车道 overlay 仍在插）；② 升级把子代理面重定义为单一 activation 语义（one-shot/continuable 双绑定前提失效）；③ 本片默认预设 ptc 的直调门连 **parent 与 child 的全部脚本化直调**一起拒（`subagent_one_shot`、child 的 `read`/`bash`）。改写它 = 按 activation 时代重设计整条编排（嵌套调用的会话事件投影、child 脚本相位、cold-resume 编排），属独立小片，不属预设切片。

**`schedule-after.e2e.ts`：种子两处已改 `ptc`；车道本体为升级期孤儿（探针实测，非本片引起，上一批「同族小改」的定性有误）**。证据：无 setup 的 agent 只见 `sidebar_open`/`working_directory`（无自动挂预设）；`schedule_create` 直调 = `UNKNOWN_TOOL`；`storageDomain.get('schedule')` 为 undefined。根因：schedule 服务只随**实验性 `schedule-bundle`** 安装（其 patch 自述「shipped Web composition carries none of these rows」），车道的 `id: schedule` overlay 只是覆写、装不出不存在的行；`tool-schedule` 只随预设行挂载（realm 限定），从未入 base/web patch。两个 describe（conversational reminders、active catalog）同根。**复活配方**（独立小片）：车道 scaffold 装配 schedule-bundle 行 + 车内直调工具调用按 PTC 口径改经 `run_code`；`schedule-panel` 同族未验。

**验证**：本车道 6/7；oxlint 0；`verify-cordis-config` 435 文件、`verify-runtime-closure` 1 预设 + 156 包闭合、`verify-md-links` 2179 文件。

### S3 双工作台与 audience 归一删除（已落地）

**三笔提交**：受众门与受众选择器（`ui-plugin-manager` 的 admission 与其 spec、页内两处 fieldset、store 的 audience 字段与两个 Host 写入口、7×2 条文案、CSS 块；包与 bundle 侧记录保留 = C6=a）；工作台标签与前端预设面（整包 `ui-workbench`、`sidebar.workbench` 席位、标签状态机与过滤、每标签预设记忆、hero run-mode 芯片及其 slots 类型；5 个 manifest、tsconfig 聚合、rescope 映射、生成目录全部重生成）；车道与文案跟随。

**本片清掉的两处死面（NMO 最小面：无消费者的缝不留）**：

| 死面 | 事实 |
|---|---|
| 渲染器呈现门 | `SlotAdmissionGate` / `SlotRendererHost.admissionRevision` / `SlotRegistry.installAdmission()` 与 `admission()` / outlet 的修订订阅 / `ui-settings-general` 与 `ui-sidebar` 两处快照 store 订阅 / `SlotCore.entriesOfSlot` 的 `admit` 谓词——**唯一安装方就是受众门**，删门后全链无调用者，`entriesOf`/`entriesOfSlot` 回归纯账本读；4 个 spec 假宿主与 3 例门用例同退，Kylin 客户端 API 目录重生成 |
| 双工作台文案 | 预设两处 overlay、禁用行理由、`settings-plugin-inventory` 两处、`settings-chrome`、`agent-preset-selection` 车首注；`ui-agent-opens` 双语文案里「编码工作台标签激活时…」一段（标签与编码内容体均已不存在） |

**本片暴露并修掉的自身缺陷（如实登记）**：删 `ui-workbench` 时同时删了 `apps/web/tests/support.ts` 的 `seedWorkbench`/`switchWorkbenchTab`，但 **5 条车道仍在 import** ⇒ 自那笔提交起 `tsc -b tsconfig.host.json` 一直是红的，本轮才发现（S3b 只跑了 client 面类型检查，属流程漏洞）。修法：去掉种子（单预部署下 seed 是空操作——任何新任务都已组合出厂预设）与相关注释，`coding-file-open` 按当前产品真相改断言（交付文件落在侧栏自己的面板 `[data-sidebar-right-panel]`，不再是编码内容体的 `[data-qilin-panel]`）；两面 typecheck 复绿。

**浏览器车道现状（本机）**：`coding-file-open` **绿**；`present` / `ptc-escalation` / `ptc-round` 红在**本机录制夹具陈旧**——`snapshots/web/**/session.v4.jsonl` 是 **gitignored 的本地录制**，其内容早于升级期加入的 `working-directory:current` 运行上下文段（同目录 `changed-files-turn`/`present-svg`/`seeded-history` 三份已在早前用真 key 重录并含该段），且当前 `ptc` 组合会挂三个创作技能而录制里没有 skill-catalog 段。**修法只能是 `QILIN_SNAPSHOT=record`（真实 key + 真实模型调用）重录**，属需单独授权的动作；与本次车道改写无关（种子在单预部署下是空操作）。

**验证（实跑）**：`ui-slots`+`ui-renderer`+`ui-sidebar`+`ui-settings-general`+`ui-plugin-manager` **419/419**；宽口径 GUI 车道 **1801 通过 / 1 红**（红为既有 `pdf-license-bundle` 的 `npm pack` 环境超时）；`tsc -b` **两面 exit 0**；oxlint 0；`verify-client-packages` 67 包、`verify-package-dependencies` 78 包、`verify-type-equiv` 466 块、`verify-md-links`、pairing（两对已重录）全绿。

### S2 存量会话 v4→v5 代次重写（C2=b，已落地）

**新代次包** `packages/session/session-format-v4-to-v5`（`src/{index,migration,codec,validation}.ts` + 19 例 spec + 双语 README 对）：折叠点恰两处——`header.agentPreset` 与每条 `agent-preset/selected.data.agentPreset`，`standard`/`cordis`/`minimal` → `ptc`；自定义标识、非字符串载荷与其它字段逐字节通过（选择事件对象原样输出，不复制、不修复）。种子切点取最后一个 `data.inherited === true` 的 `session/end-seed` 自身索引，缺标记直接拒绝；非种子源 `headerInheritedEventCount: 0`。物理面复用已发布 V2 行封装 + V4 行准入（V5 只加词汇）。`resolve()` **不加兜底**（不做别名 fold，保持 fail-loud）。投递水位仍按代次：`sessionFormatVersion: 4` 的 delivery-accepted 在 V5 下不再生效。

**引擎与文档**：`SESSION_FORMAT_VERSION` 4→5（[types.ts:89](../packages/core/session/src/types.ts)）；catalog 增依赖/引用并重生成（v0→v5 五边链路）；persistence 目录与 schema 重生成；新增变更记录 `docs/persistence-changes/2026-10-11-session-format-v5.*` 与归档 `historical-formats/v4.*`（63 根 / 606 类型）。

**夹具面**：`snapshots/sdk` 八个场景再生当前代次 fixture（`session.v5.jsonl`）与金样；`apps/web/tests/preset-migration.snapshot.ts` 期望由 `['ptc','standard','ptc']` 改为 `['ptc','ptc','ptc']`（v5 边把 `standard` 折成 `ptc`）。

**本片修的一处门禁漂移**：`scripts/session-snapshot-corpus-policy.spec.ts` 在写入器升到 5 后仍按 v4 时代构造夹具（`adjacent = [1, 2]`），4 例红——已改为按 `SESSION_FORMAT_VERSION` 推导受保留边（`[1, 2, ...4..当前-1]`）与基线多数（`retainedRoleCount + 1`），**16/16 绿**。

**验证（实跑）**：`session-format-v4-to-v5` + catalog **54/54**；`session-format` + `core/session` **1801/1801**；`session-persistence-jsonl` **749/749**；`tsc -b`（边 + 目录 + 持久化）exit 0；oxlint 0；`verify-persistence-changes`（63 根 / 11 条历史）、`verify-persistence-catalog`、`verify-persistence-formats`（v0–v5 六份完整参考）、`verify-runtime-closure`（1 预设 + 157 包）、README 三门（summaries / limitations / model-experience）与 pairing 全绿。

**本片修掉的两项 SDK 快照红**（writer 代次直接后果）：场景的**最新 session fixture 兼作 writer oracle**（`retained ? writer.expected.jsonl : 最新 session.*.jsonl`），代次升到 5 后 `text-turn` 与 `subagent-qilin-sdk-diagnostic` 的比对必然在 `sessionFormatVersion` 上不符。按仓库机制 `QILIN_SNAPSHOT=refresh` 再生：新增两份 `session.v5.jsonl`、`text-turn` 金样 1 行（版本戳），`subagent-qilin-sdk-diagnostic` 金样 25/20 行——后者除版本戳外还记录了当前运行时的 activation 期事件流（+2 `subagent/catalog`、+2 `agent/inbox/spliced`、+1 `user/message`，seq 重锚），**这一处需要复核**：它把升级期的激活语义变化一并钉进金样。SDK 车道 8 红 → **6 红**。

**登记不修（SDK 快照面 6 项，独立小片）**：`serial-created`（`SDK snapshot session has no request model`——该 curated 场景的主 fixture 无请求记录，`SDK_ASSERTIONS.route` 未声明）、`subagent-activation-limit`（120s 超时）、`subagent-fork-in-process` / `subagent-spawn-in-process`（`subagent.finished` 未观测到）、`subagent-qilin-sdk-dynamic-route`（日志数 1 ≠ 2）、`tool-error-details`（**S1 相关**：场景同时演练 native 直调与 PTC 两条呈现臂，合并后 `tool-presentation` 只剩 ptc，`denied-native` 臂在到达 `tools/pre-execute` 之前即 `UNKNOWN_TOOL`——升级已删除 `both` 档，native 臂不可能复原；修法=按 PTC 单臂重写脚本 + 重推期望）。修复只能靠 `QILIN_SNAPSHOT=record`（真实 key 与真实模型调用）或逐场景改写，已在升级计划 §6.70 登记为既有基线，需另行授权。

### S5 Open 门禁（第一批已落地：第三方接入 + 官方摘除）

**S5-A 第三方零核心改动接入**：新增 [third-party-plugin.e2e.ts](../apps/web/tests/third-party-plugin.e2e.ts) 与夹具 `apps/web/tests/fixtures/plugins/fixture-third-party/`（`package.json` + `cordis.patch.yml` + `index.js`）。夹具只用公开契约——`name` / `inject = ['tools']` / `apply(ctx)`，以及 `ctx.tools.register({ name, description, parameters, output: { schema, render }, execute })`——并在**托管 profile** 上按 `qilin plugin add` 的落点安装并启用（`profile: { packages: [{ dir, enabled: true }] }`：写进 manifest 依赖、链接进 profile `node_modules`、列入启用 bundles）。三条断言：工具进入**进程级**名册（发现）、进入该会话 agent 的**模型可见**名册、并经产品自己的 `run_code` 传输**执行**并返回 `THIRD_PARTY_OK`。夹具位于 `apps/web/tests/fixtures/`，`packages/**` 无一处命名它——这就是 Open 的可测口径。

**S5-B 官方插件可摘除、核心链路存活**：新增 [without-official-plugins.overlay.yml](../apps/web/tests/without-official-plugins.overlay.yml)（`ui-trajectory` 客户端行 + `mcp-resources` 宿主行整行关闭），并在 [shipped-composition.e2e.ts](../apps/web/tests/shipped-composition.e2e.ts) 增一例：① 出厂部署本就关掉 base 的宿主 `tool-web` 行（客户端模块图里没有 `client-ui-trajectory`、Loader 里两行 `options.disabled === true`）；② 出厂 `session/create` RPC 仍应答并把会话发布出来；③ 该会话的 agent 名册仍含 `run_code`，且 `web_search` / `web_fetch` **两个都在**——即 `tool-web` 的摘除由预设平面补齐，能力不随官方行消失；④ 会话头的 `agentPreset` 为 `ptc`，接受请求的组合就是运行它的组合。

**验证（实跑）**：两条车道各自绿（`third-party-plugin` 1/1；`shipped-composition` 该例 1/1，其余 7 例按 `-t` 跳过）；新车道已登记进 [tsconfig.host.json](../tsconfig.host.json) 的 host 面 include 表；`oxlint` 0；`tsc -b tsconfig.host.json` exit 0。

**如实登记的边界**：① 本片的「摘除」是**组合层关闭行**（插件不再激活、其注册项消失），不是从 profile 依赖里卸载包——卸载走 plugin-manager 的既有路径，本片未重复覆盖；② `tool-web` 的官方宿主行在本仓**早已**在部署层关闭、由预设层提供模型可见工具，本片把这一事实变成断言，没有新增移除；③ `present` / `ptc-escalation` / `ptc-round` 的重录与 S5 无关，仍在待授权项。
## 10. 下一步

**更正（核实于本片）**：本节的进展记录里曾出现「S4 三笔提交已落地」的说法——经 `git cat-file` 与 `git log` 核实，那三笔提交**均不存在**，HEAD 当时是 S3 的收口提交，S4 **从未开始**。下面那句 S4 描述是**待办范围**，不是已完成事实。

~~S2 存量会话 v4→v5 代次重写（C2=b）~~ · ~~S3 双工作台与 audience 归一删除~~ **均已落地（见上）** → **S4 前端零预设面清账**：AgentPresetChip 与 slots.ts 契约下架、display.ts 内建键收敛、locales 三预设文案并一、guide/描述句、apps/web 种子与 shipped-composition 断言对齐、`QILIN_TOOLS_MODE` 缝处置（T9），并补常备 grep 门「退役预设 id 零回流」。浏览器车道重录（`present`/`ptc-escalation`/`ptc-round` 的本地 v4 录制）需 `QILIN_SNAPSHOT=record` 与真实 key，单独授权后执行。schedule-after/schedule-panel 复活与 child-orchestration 重设计为可并行登记片，不阻塞主线。
## 11. S4 与 T9 收口（2026-10-11 续）

**S4 已落地**：内建键收敛为唯一出厂预设——`display.ts` 的 `BuiltInPresetCopyKey` 只剩 `presetPtcName`/`presetPtcDescription`，映射表只剩 `ptc`；两处客户端字典（`ui-agent-preset`、`ui-settings-plugin-inventory`）各删两套退役文案，中英同步；文案面按单预设施事（引导句、创造入口、模式开关说明），不再把标准/编码/创造当三个并列模式；车道断言与三份金样按新文案重录。**新增常备门 `verify-preset-copy`**（挂 `doc-quick`）：出厂预设目录、display 映射与两处字典必须逐项一致，退役 id 的文案键或映射零残留；门自带 9 例规格（含漂移负例）。`apps/web/tsconfig.json` 补回第三方插件车道的 host 面排除（S5 引入时漏项，客户端面因此红）。

**T9 已收口**：两处部署 patch 的 `tools.mode` 由「未设即 schema 默认 native」改为 `process.env.QILIN_TOOLS_MODE ?? 'ptc'`——不设环境变量时的行为与出厂预设的 PTC 呈现一致，缝降级为覆盖开关；patch 注释与两份 bundle README 双语同步，并登记上游 per-session 选择落地后退役该缝。

**验证**：三包单测 377/377 · 新门 9/9 · `tsc -b` client/host 两面 0 · oxlint 0 · `verify-cordis-config` 436 · 两 bundle 测试 125/125 · `verify-preset-copy`、`verify-md-links` 2183、`verify-client-ui-i18n` 1017、`verify-doc-budgets` 8、`verify-runtime-closure`（1 预设 + 157 包）、`verify-client-packages` 67、`verify-package-dependencies` 78、`rescope-vendor --check` 8470 · 浏览器车道 `agent-preset-authoring` 7/7、`agent-preset-selection` 5/5（replay 复验）。

**登记**：`steering.e2e.ts` 3 红是**既有红**——A/B 实测（暂存到 HEAD + 重打包客户端 + 重建前端 dist）失败集合完全相同，与本片无关。S6 剩余（首启度量脚本、打断点审计表、docs/nmo 对账附录）见 §10。
