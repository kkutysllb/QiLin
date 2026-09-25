# rc.2 未对齐功能面审计（QiLin main ⨯ 上游 dsh-v0.1.7-rc.2）

> 工作文档（临时审计，非决策记录）。数据采集 2026-09-25；三路分析（引擎侧、web/scripts 簇、客户端 UI 簇）。
> 目的：把「很多没对齐」拆成可执行批次，剔除品牌改名、自有设计、边界排除。

## 0. 口径与方法

**比对对象**：QiLin `main`（rc.2 对齐批次 A–F2 落地后的 HEAD）对上游 tag `dsh-v0.1.7-rc.2`。

- 本地 dsh 仓库的 `master` 内容上等于该 tag（`dsh-v0.1.7-rc.2..master` 为 0 提交）→ **不存在「更新的一版上游」未对齐**。
- 其 `kcoder/0.1.7-rc.2` 分支另有 43 个 KCoder 自有提交，按既定口径不采。
- QiLin 与上游无共同祖先（独立 root 历史）→ 用**树级比对**而非提交区间比对。

**三个维度**：① 双树 `git ls-tree` 差集（只比存在性，规避改名噪声）；② `packages/bundle/*/cordis.patch.yml` 插件行归一化 diff；③ 上游符号/包名在 QiLin 全树反查。

**排除项**：apps/desktop 与 apps/desktop-host（铁律一）、账号栈（铁律二）、@deepseek-ai→@qilin 与 cordis→kylin 改名、i18n sidecar/双语 README、品牌资产。

**留档**：/tmp/align-audit/、/tmp/align-audit2/。

## 1. 结论速览

rc.2 主体（批次 A–F2）确实在树里。真正的未对齐是 **8 个功能簇 + 测试/门禁尾巴**：

| # | 簇 | 性质 | 用户可见 | 体量 |
|---|---|---|---|---|
| J | 后台任务远程面（roster/follow/kill） | 真缺口 | 是 | 大（1 新包 + 3 源文件 + 客户端改写） |
| C2 | 会话过程按活动分组 + 非人类触发回合提示 | 真缺口 | 是 | 大（ui-chat + ui-conversation 渲染契约） |
| C1 | 文档预览族：表格原生 / 缩放 / 静态 HTML / 本地图片 / 资源变更刷新 / 工具栏插件位 | 真缺口（含产品决策） | 是 | 大（含 3 个依赖补丁） |
| C3 | 侧边栏与会话基础设施：置顶、常驻头部、目录监听、视图引用、稳定标签容器 | 真缺口 | 是 | 中 |
| C4 | 工具调用结构化详情卡 + todo 变更历史 | 真缺口 | 是 | 中 |
| C5 | 小图元与入口：PathLabel、SegmentedControl/Tabs、协议产品名、输入栏窄宽折叠、预设指南弹窗、预览头部打开入口 | 真缺口 | 部分 | 小 |
| S | 引擎零星：GitHub 连接检查、default-workspace | 真缺口 | 间接 | 小 |
| G | 工程门禁 4 项 + 生成器 1 项 | 门禁缺口 | 否 | 小 |
| P | 依赖补丁：pi-ai 0.85.1 | 真缺口 | 间接 | 极小 |
| O | 随包 runtime 的 Office 支持 | 真缺口（需决策） | 间接 | 中 |
| T | 测试与产物面（e2e 面、快照、spec） | 测试缺口 | 否 | 大 |

**默认挂载面 diff**：web-app 只缺 `api-job-controller`（簇 J）；base 缺 `config-editor`（自有 `settings-file` 等价）、`authorization`（见 §9）、账号两行；sdk-app 缺 `skill-office`+`tool-workspace-dependencies`（簇 O）。

## 2. 簇 J：后台任务远程面

上游 0.1.7-alpha.1 引入 `packages/api/job-controller`，rc.2 已挂进 web-app bundle；QiLin 整包缺失且仍是旧架构。

| 上游 | QiLin | 影响 |
|---|---|---|
| `api/job-controller`：Host `ctx.jobController` + Client `ctx.remote.job`；`job.list` 整集帧、`job.follow` 绝对字节偏移续传、`job.kill` 人工停止 | 无此包（`job-controller`/`jobController` 全树 0 命中） | 任务列表没有「展开看实时/保留输出」与「从 UI 停止任务」 |
| `jobs/jobs-local/src/{events,pump,ring}.ts` | 只有 `index.ts` | 无 job 输出保留/续传底座 |
| `workflow/tool-workflow/src/record.ts` | 无 | 后台工作流无实时进度行 |
| `jobs/jobs/src/view.ts` | 无 | — |
| `client/ui-jobs` | 文件集相同、接线不同：上游 `inject=['jobs','slots','locale']`；QiLin `['sessions','slots','locale']`（`jobsBySession` 镜像，README 明写「不发 RPC」） | 客户端随 Host 面一起改 |
| 上游 rc.2 已无 `session/jobs` 帧 | QiLin 仍依赖 | 属架构换代 |

上游笔记：`2026-09-01-jobs-absorb-activity-record`、`2026-09-03-jobs-seam-consolidation`。
配套测试：`apps/web/tests/live-job-stream.e2e.ts`、`background-job-list.e2e.ts`。

## 3. 簇 C1：文档预览族

`client/ui-sidebar-documentpreview` 上游 185 文件 vs QiLin 118；**该包是生效实现**（见 §10 的 coding-sidebar 撤回说明），不是自有替代。

| 上游 | QiLin | 影响 |
|---|---|---|
| `src/client/excel/**`（14 文件）+ `licenses/FortuneSheet.txt`，依赖 fortune-sheet + exceljs（3 个 pnpm patch） | 无（`ExcelBody` 0 命中） | .xlsx/.xls/.csv/.tsv 在浏览器打开（工作表标签、单元格选择、公式栏、冻结标题、缩放）；QiLin 只能 office→PDF |
| `src/client/zoom/**`（7 文件） | 无（`ZoomViewport`/`ZoomControls` 0 命中） | 图片/PDF 预览缩放控件与视口 |
| `src/client/html/basic-document.ts` | 无（`DOMPurify` 0 命中） | 静态（禁脚本）HTML 预览 + 清洗 + 限制性 CSP；QiLin HtmlBody 只有 allow-scripts iframe |
| `src/client/markdown/path-images.ts` | 无（`markdownImageUrl` 0 命中） | Markdown 内本地图片按文档相对路径解析 |
| `src/client/document/resource-group.ts` + contract 的 `failed/addResource/setResources` | 无 | HTML 打包资源变更自动刷新、加载失败回调 |
| office 工具栏插件位（`sidebar.right.tab.document.actions`/`unpreviewable`/`action`） | 无（仅 ui-settings-general 命中 `tab.document.action`） | 预览头部/不可预览空态的插件动作位 |

## 4. 簇 C2：会话过程展示重构

| 上游 | QiLin | 影响 |
|---|---|---|
| ui-chat：`ChatGroupSeat`、`render-entry.ts`、`step-process.ts`、`use-disclosure.ts`、`contract/process-groups.ts`、`conversation-nodes/process-{activity,groups}.ts` | 全 0 命中；`TurnProcessNodeView` 仍按 `toolCallCount/messageCount/subagentCount` 计数 | 「工作步骤」按活动类别（读取/搜索/编辑/命令/网页搜索/子代理/计划）分组折叠 + 运行中分类标题 |
| ui-conversation：`contract/groups.ts`、`conversation/{group-registry,group-store}.ts` | 0 命中 | 渲染位置分组 API（GroupKey/NodeReference/RenderEntry），C2 的依赖 |
| ui-chat：`TurnTriggerNodeView`+`turn-trigger.ts` | 0 命中 | 非人类触发回合（计划/目标/子代理/插件/webhook 唤醒）的独立可展开提示行 |

## 5. 簇 C3：侧边栏与会话基础设施

| 上游 | QiLin | 影响 |
|---|---|---|
| ui-workspace `session-actions/PinSession.tsx`+`pin-order.ts` | 0 命中（数据层已支持 `pinnedSessionIds`） | 会话置顶与置顶排序无客户端入口 |
| ui-conversation `skeleton/ConversationHeader.tsx` + `conversation.header.leading` 槽 | QiLin 只有 `conversation.session.header` | 未选中 Session 时常驻会话头部 |
| ui-sidebar-right `session-view.ts`/`session-views.ts` | 0 命中 | 每个侧边栏视图独立持有/保留 Session 引用（切视图不丢状态） |
| ui-sidebar-right `focus.ts`/`shell/close-focus.ts` | `visibleSidebarPane` 0 命中 | 打开/分栏替换面板后的焦点连续性（即 rc.2 移交清单里的 `page.close` 属主 / `shortcuts-panels` 前置） |
| ui-sidebar-files `directory-node.ts` | 无（该包 src 内 `watch` 0 命中；`FileTree` 仅展开时列目录） | 文件树目录监听与磁盘变化自动刷新 |
| ui-dockkit `components/TabLayout.tsx` | `DockSurface` 只有 `PaneTree` | 稳定标签容器（浮动/分栏移动不重挂载宿主，内嵌 webview 不重载） |

## 6. 簇 C4：工具调用结构化详情

- ui-tool 缺 `ToolDetails.tsx`+`css`、`models/{detail-model-shared,control-details-model,details-card-model,inspection-details-model}.ts`、`toolviews/details-row.tsx`、`models/{todo-diff-model,todo-history}.ts`（QiLin `apply.ts` 未注册 `detailsToolview`；`ToolDetails`/`todoHistory` 0 命中）。
- 影响：agent/job/terminal/LSP/巡检类工具没有字段/列表/状态/变更/badge 详情卡；`todo_write` 没有前后差异与变更历史。
- 配套：`apps/web/tests/tool-details.e2e.ts`、`snapshots/web/tool-details/*`、上游 note `2026-09-10-compact-tool-details`。

## 7. 簇 C5：小图元与入口

| 上游 | QiLin | 判定 |
|---|---|---|
| `ui-primitives/PathLabel.tsx` | 0 命中 | 真缺口（路径标签：目录弱化、尾部渐隐、hover 全文） |
| `ui-primitives/SegmentedControl.tsx`、`SegmentedTabs.tsx` | 0 命中 | 真缺口（模型设置「添加方式」、预设指南用） |
| `ui-settings-models/protocol-label.ts` | QiLin `store.ts:126` 只回 schema id | 真缺口（协议下拉显示产品名而非 `openai-completions`） |
| `ui-conversation/skeleton/control-row-layout.ts` | 0 命中 | 真缺口（输入栏窄宽时模型名塌缩为图标） |
| `ui-agent-preset/PresetGuideDialog.tsx`+`guide-locales.ts` | 0 命中 | 真缺口（预设「说明/用法」指南弹窗） |
| `ui-open-in-app` 的 `OpenPathAction`/`OpenPathEmptyAction`/`OpenTargetButton`/`applications`/`file-applications`/`open-failure-toast`/`FileRouteAction` | QiLin 只有会话头部 `OpenInAppAction` | 真缺口（预览头部「用其他应用打开」、不可预览空态入口、交付物文件动作） |

## 8. 簇 S / G / P / O：引擎侧

**S 零星真缺口**：`boot/plugin-manager/src/github-connection.ts`（装插件前 GitHub 连通检查，配 `plugin-install-github\|registry` e2e）；`api/workspace-controller/src/default-{directory,workspace}.ts`（首用 Workspace 命名）。

> **执行期新增结论（2026-09-25）**
> - **客户端路由门禁已接线并修绿，但存在「门禁盲区」**：门禁只读请求目标里的字面片段与 `*_PATH`/`*_ENDPOINT` 键名，按名字判定而不看值。因此以下生产者**仍绑定源站根而门禁看不见**，属下一批要补的真缺口：`apps/web/src/auth/auth.ts` 的 setup/register/login、`packages/host/open-in-app/src/shared.ts` 的 `OPEN_IN_APP_*_ROUTE`（客户端仍用 `hostBase()` = `location.origin` 解析）、`packages/client/file-upload`（只有 `FILE_UPLOAD_PATH`，`runtime.ts` 直接拼 path）、`packages/client/ui-deliverables/src/changes.ts` 三个 `CHANGES_*_PATH`。另 `account-api.ts` 的 `location.assign('/')` 属导航，门禁不治理。
> - **S2 维持延后**：上游该链的消费方在 QiLin 全缺（`workspace-controller/src/index.ts` 的首用创建、`client/ui-conversation` 的 `workspaceDisplayTitle` 标注、`client/ui-workspace` 行文案），单独移植两个纯函数会成死代码；前置是「首用 Workspace」整体能力。
> - **G4 转独立批次「preset skills 追平」**：`packages/preset/agent-presets` 的 skills 面落后——QiLin 只有 2 个技能（`cordis-plugin-development`、`editing-cordis-compositions`，且内容停在更早版本），缺 `cordis-composition-reference` 整技能、`cordis-plugin-development` 的 4 个 references（host-plugin/mcp-bundle/ui-plugin/verification）与 4 个 templates（decoration×4、mcp×2）；`gen-plugin-packages` 的生成目标正是那个缺失技能。移植需逐处品牌裁决：QiLin 既有技能把 “Cordis compositions” 写作 “Kylin compositions”，而 Loader 方言名（`cordis.yml`、`cordis:group`）保持不变。

**G 工程门禁**（已按子审计修正）：

- 真缺口：`verify-package-meta`、`verify-client-route-resolution`、`verify-no-unknown-casts`（+baseline，按 QiLin 现状重采）、`gen-plugin-packages`+两条 npm script；配套 CLI `apps/cli/src/dump-config-schema.ts`+期望 e2e+golden（先决 `app-boot` 的 `generateConfigSchema`，QiLin 0 命中）。
- 只缺 spec：`verify-package-paths.spec.ts`、`request-input-types.spec.ts`、`release/process.spec.ts`。
- 已改名等价：`verify-dsh-package-licenses`→`verify-qilin-package-licenses`；`gen-cordis-*`/`cordis-core-api`→`gen-kylin-*`/`kylin-core-api`。
- 排除：`scripts/primary-runtime/*`（桌面）。

**P 依赖补丁**：`@earendil-works/pi-ai@0.85.1` 补丁（流式分支不再每段 delta 反复解析部分 JSON）——QiLin 同版本 pin 但无补丁。fortune-sheet×2 + exceljs 三个补丁随簇 C1。

**O 随包 runtime 的 Office**：`packages/skill/tool-workspace-dependencies` 整包缺失；`skill-office` **QiLin 有包但全树零挂载**；`bundle/sdk-app` 缺两行；`apps/cli` 不依赖二者；`python/sdk-runtime/_resources.py` 缺。

## 9. 待决策项

| 项 | 上游 | QiLin | 建议 |
|---|---|---|---|
| 产品埋点 | `host/product-telemetry-otel`（**未被任何 bundle 默认挂载**） | 无包、全树零引用 | 与隐私取向冲突；若采只补包不挂载 |
| 授权流程注册表 | base bundle 挂 `dsh-authorization` | **有包** `credentials/authorization`，任何 bundle 都未挂载 | 可能是漏挂；采则 base patch 加一行 |
| 桌面语言预载桥 | `client/locale/src/client/bootstrap.ts`（`__DSH_LOCALE__` 预载 IPC） | `client/locale` 无 bootstrap；但有 `src/locale-settings.ts`（Host 用户设置文档里持久化 `locale.preference`），语言切换在自有账号菜单 | 属桌面边界；若 QiLin 桌面项目要同类接口，另立 `__QILIN_LOCALE__` 桥 |
| desktop-locale.e2e | 依赖 `fixtures/native-open-on.patch.yml` | 无 | 与上一条一并裁决 |
| `swr`-类共享语言行 | `settings.locale` 行 | 语言切换在账号菜单（位置不同） | 设计分歧，按自有口径保持或补设置行 |

## 10. 等价重构（不是缺口）

| 上游 | QiLin |
|---|---|
| `extensions/{cordis-*}` | `extensions/kylin-*`（同名同构改名） |
| `preset/agent-preset`+`agent-preset-registry` | `preset/agent-presets` |
| `subagent/subagent-dsh-sdk` | `subagent/subagent-qilin-sdk` |
| `boot/config-editor`+`app-boot/config-schema` | `settings/settings-file`+`api/settings-controller`（Web 写路径 `ctx.remote.settings`） |
| `ui-settings-{shell,agent-loop,subagent,web-search}` | `ui-settings-plugins`（BashCard≡ShellCard、AgentLoopCard、SubagentCard+Limits/ModelSelection、WebSearchCard + controllers + `PluginConfigForm`/`fields`） |
| `ui-settings-account`+`credentials/deepseek-account*` | 自有 `ui-account`+`identity/accounts-local`（铁律二） |
| `ui-primitives` 的 CodeToolbar/ConfigField/settings-form/**MenuSurface**/PermissionIcon/TextShimmer/code-highlighting/overlay-top-margin/artwork | 就地实现：`markdown/CodeBlock` 自带复制头、`PluginConfigForm`、各菜单组件、SHIELD 图标、shimmer CSS、`markdown/highlight.ts`、`useAnchoredMaxHeight` |
| ui-chat 滚动/阅读 hooks（6 个） | `ChatView.tsx` 内联 follow-scroll/几何 |
| ui-sidebar-browser 持久化与分层 | `BrowserNavigation.ts`/`BrowserFrame.ts` 合一 |
| ui-plugin-manager `navigation-store`/`PluginsPanelIcon` | `PluginManagerPage.tsx` 内联 + 自注册侧边栏入口 |
| ui-workspace `session-actions/{Archive,Fork,Rename,RowActionToast}`、`AnimatedRows` | `navigation.ts`+`WorkspaceBrowser` 行菜单 + CSS 动画 |
| ui-deliverables `FileDiff`/`file-actions` | `ReviewTab` 自研 hunk 渲染 + `present-open.ts` |
| ui-settings `config-form` | `settings-mirror.ts`+`card-form.ts` |
| ui-conversation `submission-settings.ts` | `conversation-settings.ts` |
| `util/code-language` | `docpreview/src/client/code/languages.ts` + `fs/tool-fs` 的 lang hint |
| `test-support/client-runtime/config-form.ts` | 自研 `settings-scope.ts`/`settings-remote.ts` |
| `verify-dsh-package-licenses`、`gen-cordis-*` | 改名等价（见 §8） |

**重要更正**：早前「ui-sidebar-documentpreview 被内置化替代」的说法**不成立**——QiLin 已用 `feat(web)!: retire the built-in coding-sidebar and file-review-kcoder plugins` 那一步把内置工作台退役，原生 documentpreview 是生效实现（因而 §3 的缺口成立）。

## 11. 边界排除（不采）

- `apps/desktop`（441 文件）+ `apps/desktop-host`；`ui-sidebar-browser/electron/**`+`types.ts`；`ui-settings-general/DesktopUpdateIndicator`+`desktop-update-source`；`quit-confirmation` 托盘族；`shortcuts-desktop.e2e`（硬 import `apps/desktop/src/keybindings.ts`）。
- 账号栈：`api/account-controller`、`credentials/deepseek-account*`、`llm/llm-deepseek-account`、`ui-settings-account`、`ui-chat/QuotaNoticeHost`、`ui-settings-models` 的账号欢迎公告与 `welcome-store`、`snapshots/sdk/account-provider-signout/*`。
- 品牌：`skill-badge/assets/dsh-badge.*`、`ui-theme` 的 Montserrat 品牌字体、`onboarding.css`、`apps/web/public/favicon-dark.svg`。

## 12. 批次清单（建议执行序）

纪律：分派前「是否已在树中」预检；串行验绿；双面 typecheck + 聚焦 vitest + `test:docs` + 配对一致 + 生成器 up to date；不整抄既有文件。

**第一批（极小、独立）**
1. **P**：移植 `patches/@earendil-works__pi-ai@0.85.1.patch` + `pnpm-workspace.yaml` 一行。
2. **G**：`verify-package-meta`、`verify-client-route-resolution`、`verify-no-unknown-casts`(+基线)、`gen-plugin-packages`+两 script 接线；补三个缺 spec；`dump-config-schema` 链待 config-schema 决策。
3. **S**：`github-connection.ts`；`default-{directory,workspace}.ts`（先做前置评估）。
4. **C5**：PathLabel、SegmentedControl/Tabs、协议产品名、输入栏窄宽折叠、预设指南弹窗、预览头部打开入口。

**第二批（中等、客户端基础设施）**
5. **C3**：会话置顶（数据层已就绪，最划算）→ 常驻会话头部 → 文件树目录监听 → 侧边栏视图引用/焦点连续性（解锁 `shortcuts-panels`）→ TabLayout。
6. **C4**：工具详情卡 + todo 变更历史（连带 `tool-details` e2e 与快照）。

**第三批（大件，需预检）**
7. **J**：jobs 远程面（先做 SessionEventMap/持久化与 `session/jobs` 退役预检）→ J1 内核 → J2 job-controller → J3 record.ts → J4 客户端 → J5 接线与 e2e。
8. **C2**：过程分组 API（ui-conversation）→ ui-chat 分组座位/渲染入口 → 触发回合提示；触及渲染契约与快照，需与 §13 的快照重录同批。

**第四批（需产品决策）**
9. **C1**：fortune-sheet/exceljs + 3 补丁 → excel/ 子树 → zoom/ → 静态 HTML（DOMPurify）→ 本地图片 → 资源变更刷新 → 工具栏插件位。
10. **O**：tool-workspace-dependencies 新包 + skill-office 挂载 + python/sdk-runtime 资源面。

**并行的测试面**：§13 的 e2e 有序清单与快照重录（尤其先补 `sdk/dynamic-tool-updates` 5 文件，属双 SDK 同步纪律）。

## 13. 测试与产物面（T）

| 区域 | 上游独有 | 说明 |
|---|---|---|
| `apps/web/tests/` | 134 | 34 个 e2e、76 个 expected、2 个 snapshots |
| `snapshots/` | 143 | rc.2 新增 46 未落（23 个 v4 重录、13 个新用例、10 个账号栈排除）；rc.1 遗留 97（51 用例 / 23 v4 / 23 改名等价） |
| `docs/` | 159 | 子系统与门禁文档 |
| `.agents/` | 396 | 含归档笔记与 i18n sidecar |

**rc.2 移交清单核实**：14 面中 2 面「不适用」（shortcuts-desktop、quit-confirmation），3 面已追平/产物在（web-runtime-context、office-font-notice、markdown-images/clickable-links/workspace-management 属「文件在内容停在 rc.1」），其余仍缺，且分三档：整文件缺（shortcuts-panels/workspace、fork-mid-turn、menu-material、focus-rings、tool-details、reasoning-preview、developer-tools-settings）、内容停在 rc.1（default-model、settings-chrome、document-preview、declared-reasoning、shipped-composition/smoke-real）、能力与测试双缺（menu-material 的 MenuSurface → 见 §10 等价说明修正、tool-details → 见簇 C4）。

**待办 e2e（有序）**：① shortcuts-workspace + 4 goldens ② focus-rings ③ fork-mid-turn + golden ④ tool-details（同批能力）⑤ developer-tools-settings ⑥ settings-appearance + 3 goldens ⑦ menu-material + 3 goldens ⑧ auto-review-approval + 快照 ⑨ code-language.snapshot + 快照 ⑩ 存量宿主追平（default-model/markdown-images/clickable-links/settings-chrome/document-preview/declared-reasoning/shipped-composition/smoke-real/workspace-management）⑪ shortcuts-panels + 5 goldens（前置 page.close 属主）⑫ bonus-notice/voice-input（偏账号，需裁决）⑬ rc.1 遗留 e2e 面（含 live-job-stream→J、excel-opc→C1、plugin-install-github/registry→S、default-workspace）。

## 14. 复核结论（支持「rc.2 主体已对齐」的证据）

- `OPTIONAL_BUNDLES` 两侧同名同集，QiLin 还多一项自有 bundle。
- `gen-kylin-*`/`kylin-core-api`/`verify-cordis-config` 与上游一一对应。
- `extensions/*`、`preset/*`、`subagent/*` 为成对改名/合并，无缺包。
- 上游 `dsh-v0.1.7-rc.2..master` 为 0 提交。
- 客户端四设置包合并、`ui-account` 承载语言切换、documentpreview 为原生实现（撤回内置化）三条已核实。

## 15. 批次一执行记录（2026-09-25，未提交）

**已落地**

| 项 | 结果 |
|---|---|
| P pi-ai 补丁 | patch 文件本就在树里但漏接线 → 补 `patchedDependencies` + `pnpm install --no-frozen-lockfile`；lockfile 仅 +3/−2；六个 provider 文件被 patch，反向 patch 干净 |
| G1 `verify-package-meta` | 脚本与上游逐字节一致 + 接线；门禁抓到真缺口：`experimental/agent-team` 缺 `"./locale/*.json"` 导出与 `files` 项 → 已补，门禁绿 |
| G2 `verify-client-route-resolution` | 脚本 + spec 接线；门禁本体原有 7 处违规 → 修上游 4 处（gateway/hmr/ui-deliverables/session-log-export）+ QiLin 自有 3 处（账号面），现 1054 文件全 document-relative、exit 0；双面 typecheck 绿；六个聚焦包 409 测试绿 |
| G3 `verify-no-unknown-casts` | 脚本 + spec + **QiLin 基线重采**（646 文件 / 1367 条 / 1697 处）+ 接线；CI 形态 exit 0 |
| G5 三个补漏 spec | `verify-package-paths` / `release/process` / `request-input-types` = 24 测试绿 |
| S1 GitHub 连接检查 | `github-connection.ts` + spec + `index.ts` 接线（`githubConnectionTimeoutMs` 默认 5000、pnpm 前 `git ls-remote`、失败归因 `spec-host`）+ README 双语 + config-catalog 重生成 |
| C5-A 共享图元 | PathLabel / SegmentedControl / SegmentedTabs + spec + README 目录（四组辨析）；该包 990 测试绿；devDependency 归位 |
| C5-B 两件 | 协议产品名（`protocol-label.ts` + 词典 + 两处 option 渲染 + e2e expected 同步）+ 输入栏窄宽折叠（`control-row-layout.ts` + InputBar 接入 + ModelSelect 变量化，删掉被取代的 `@container` 方案） |

**顺带清掉三处 main 既存红**（核实过 HEAD 同样红，非本批引入）：① `source-artifacts` 门禁从未接线而 spec 要求 → 已接入 static/hygiene 两处（run-gates.spec 107/107 绿）；② `replaceWindow` 的 JSDoc 被错误留在 `openTurn` 上方 → 移回，`verify-export-jsdoc` 绿；③ `ui-settings` 的 `@qilin/schemastery` 依赖归类 → `--fix` 归位，`verify-package-dependencies` 绿。

**未落地 / 转下批**

- **G4 preset skills 追平：已落地**。新增 `cordis-plugin-development/references/{host-plugin,mcp-bundle,ui-plugin,verification}.md`、`templates/{decoration×4,mcp×2}`、新技能 `cordis-composition-reference`（`SKILL.md` + 生成的 `references/packages.md`，236 条 `@qilin/*`）、`editing-cordis-compositions/references/native-product-subagents.md`、`tests/skills.spec.ts`；`cordis-plugin-development/SKILL.md` 与 `practices.md` 更新到 rc.2 口径；`gen-plugin-packages` 生成器落地并接线（`package.json` 两行 + doc-sync 一个 gate），`verify-plugin-packages` 通过。
  品牌口径：`cordis.yml`/`cordis:group`/`cordis:include`/`!!js`/`cordis_inspect_*`/技能名保留 Cordis；Harness→QiLin、`@deepseek-ai/dsh-*`→`@qilin/*`、`$DSH_HOME`→`$QILIN_HOME`、`dsh.client`→`qilin.client`；Desktop/app.asar 段与 `DSH_PROFILE` 段删除。
  **G4 暴露的新缺口**：① `Config` inspect provider 在 QiLin 缺失（上游 `packages/extensions/tool-cordis/src/config.ts`；QiLin `tool-kylin/providers.ts` 只有 Service/Event/Builtin/Tool + Slots/Theme），技能里 3 处已改写为 QiLin 可行路径；② 上游 `editing-cordis-compositions` 是 #4569「声明式 preset」重写版，而 QiLin 仍是 `presets/<id>/agent.cordis.yml` 目录式——逐字移植会教模型使用不存在的 `@qilin/agent-preset` 声明行，故采取「保留结构 + 带过 rc.2 新增」，字面对齐需连带移植 `agent-preset-registry`；③ 技能渲染长度受 pruner 8192 阈值约束（改前 `editing-cordis-compositions` ≈8.8k 已超阈），已把 2,834 码点段落移入 references；④ `snapshots/session/skill-load/*` 内嵌旧技能正文，且 `test:snapshot -t skill-load` 在 HEAD 因无关 stderr 断言（`llm-deepseek` 重复注册告警）即失败，重录需 key。

**最终验证（批次一收尾）**：门禁 spec 合并跑 `314 passed | 1 skipped`；`run-gates.spec` 107/107；`test:docs` **20 passed / 0 failed**；`verify-plugin-packages` up to date；`tsc -b tsconfig.client.json` 与 `tsconfig.host.json` 双面 exit 0；plugin-manager + ui-primitives 1165 测试绿；ui-settings-models + ui-conversation 746 测试绿；agent-presets 195 测试绿。
- 门禁盲区：`apps/web/src/auth/auth.ts`、`open-in-app`（客户端仍用 `hostBase()`）、`file-upload`、`ui-deliverables/changes.ts` 仍绑源站根，门禁按名字判定看不见。
- 既存红（与 C2 簇绑定，未 hack）：`packages/extensions/kylin-client-runner/tests/providers.client.spec.ts` 断言 `conversation.chat.*` 注入面含 `useDisclosure?`，该字段随上游「过程分组」而来（簇 C2 未落地）；`ui-chat` 源码在 HEAD 即无此字段，故这是 C2 的又一证据。
