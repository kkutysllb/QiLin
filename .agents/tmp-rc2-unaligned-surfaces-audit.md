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

## 16. 批次二执行记录（2026-09-26）

- **门禁盲区四处已补**（提交前）：`host/open-in-app` 的 `OPEN_IN_APP_*_PATH` 派生 ROUTE（客户端删 `hostBase()`）、`file-upload`（`resolveUrl` 改 `document.baseURI`）、`ui-deliverables/changes.ts` 三个 `CHANGES_*_ROUTE`、`apps/web/src/auth/auth.ts` 的 `*_ROUTE`；新增 `apps/web/tests/auth-document.spec.ts`。
- **门禁检测面同时扩展**：间接请求目标（局部 const/函数 return，深度 4）、模板拼接里的 `*_PATH`/`*_ENDPOINT`、location-base 追踪（含 `globalThis` as-cast 形态），并用「语料声明索引」区分同名非路由键；1073 个浏览器源文件零误报，spec 16 例；**未加任何白名单**，`main()` 加空语料守卫。
- **又发现一处同类盲区**：`packages/client/connection/src/client/rpc.ts` 仍用 `location.origin` 拼 RPC 目标（`new URL(channel/endpoint, resolveBase())`），门禁看不见 → 列入后续批次。
- **配置 schema 投影 + `Config` inspect provider（第二层第一步）已落地**：`boot/app-boot/src/config-schema/{types,native,pattern,projector,collect,document,index}.ts` 7 个文件 + 对应 4 个 spec 移植（`RuntimeResolution`→`ProfileResolutionGeneration`、`installRuntimeInterception`→`installProfileResolution` 三处适配，其余逐字）；`tool-kylin/src/config.ts` 的 `queryLiveConfig` 注册为 `Config`/`listConfigs`。**真实查询已验证**（`@qilin/settings-file` 投影出完整 JSON Schema 2020-12；`@qilin/session-persistence-jsonl` 为 `acceptsMissing=false`，`required:["root"]`）。app-boot 与 tool-kylin 两包 **576 测试绿**。
  顺带修正 `app-boot/README` 中「存在 `--dump-config-schema`」的虚假声明（QiLin CLI 无此 flag），并记入 Known Limitations。
  **第二层（声明式 preset）仍需的前置**：① CLI `--dump-config-schema` 接线（`generateConfigSchema` 目前无生产消费者）；② `Profile.skippedBundles` 追踪（上游有、QiLin 无）；③ **决定 preset 行是否成为 Loader 条目**——`queryLiveConfig` 只读 `ctx.loader.entries()`，而 QiLin 的 preset 树是运行时 `ctx.plugin` 挂载、不在 Loader 树内，声明式 preset 必须先解决这一点，否则 Config provider 覆盖不到它们；④ patch 定向 id 语义对齐。
- **卫生事故（已清理）**：并行任务把 **143 个编译产物直写各包 `src/`**（`packages/boot` 52、`vendor/loader` 32、`packages/util` 30、`packages/jobs` 20 等）。已按「同基名有受跟踪的 `.ts`/`.tsx` 源」判据删除 142 个，只剩 `client/ui-jobs/src/css-modules.d.ts`（手写声明件，与 53 个同类受跟踪件一致）。**后续提交不得盲用 `git add -A`**。
- **快照 lane 当前不可用**：`test:snapshot` 在无 key 工作树因无关 stderr 断言失败（`llm-deepseek` 与 `llm-deepseek-api-key` 都注册 `deepseek-official` adapter），对照组 `-t text-turn` 同样失败 → 任何"快照未回放"的结论都需在有 key 环境复验。
- **又一条既有红（已修）**：`packages/client/ui-open-in-app/tests/browser-plugin.client.spec.ts` 4 例失败——bench 只 provide 了 `sessions`/`locale`，而 `inject` 声明了 `layout`/`shortcuts`，fiber 因此始终 pending、apply 从未执行（子代理用临时还原 HEAD 复跑证明确为既有红）。已按插件实际读取面给 bench 补上 `layout.panelInfo.getSnapshot()`、`shortcuts.register`、`sessions.list.getSnapshot()` 三个驱动桩，spec 转 **7/7 绿**。

### 簇 C2 落地记录（2026-09-26）

- **已落地**：ui-conversation 的 `contract/groups.ts` + `conversation/{group-registry,group-store}` + assembler/location-index/assembly 的 `changedTurns`/`grouped` 支持；ui-chat 的 `ChatGroupSeat`、`render-entry`、`step-process`、`use-disclosure`、`use-process-scroll`、`use-scroll-follow`、`turn-trigger`、`TurnTriggerNodeView`、`contract/{process-groups,chat-visibility}`、`conversation-nodes/process-{activity,groups}`；ui-tool 的 `ToolCallCommonProps.useDisclosure` 面。
- **验证**：7 包 **1493 测试绿**（含 process-groups 28、conversation-groups 12+19、turn-trigger 17）；`verify-client-catalog` up to date（catalog 不再截断）；`verify-client-ui-i18n` 846 文件通过；**`kylin-client-runner` 的 `useDisclosure?` 那条既有红已消除**。
- **未触及**：`SessionEventMap`/会话格式/持久化（本簇确实不改格式）；`TurnProcessNodeView` 仍是 QiLin 自有计数式控件，分组只接管过程行。
- **遗留**：① ~~上游「基础设施行过滤」未移植~~ —— **此处先前记载有误，已核实更正**：`contract/chat-visibility.ts` 的 `isVisibleChatNode`（排除 system-prompt / 普通 context / permission command）**已随本簇落地**，并被 `process-groups.ts`（判定为独立根条目、不并入组）与 `turn-process-presentation.ts` 消费。未接入的是**可见序**：`chat-snapshot-builder.ts` 的 `orderedVisibleChatNodes` 仍按 `visibility === 'visible'` 过滤，注释明说「上游 infrastructure-row 过滤未移植」。因此这些行**仍渲染为正文行**，不是被吞；它们位于 Turn-process 容器内，捕获/浏览时随该容器折叠而隐藏。② ~~`ChatGroupSeat`/`use-process-scroll`/`use-scroll-follow`/`render-entry`/`step-process` 缺渲染级 spec 会红覆盖率门禁~~ —— **该判断已被实测推翻**：这些路径在 `vitest.config.ts` 的 `coverage.exclude` 里（上游同样豁免）。真正卡门禁的是 `contract/chat-visibility.ts` 的 branches 85.71%（`permission` command 分支从未被求值，因为移植时裁掉了上游同名用例），已单独修复；③ 上游 turn-tail 完成页脚、ChatView viewport 重构、`toolCallFocus`、`ChatNodeStore.turnDataSource`、`apps/web/tests/step-process.e2e.ts` 属其他簇，未动。

### 簇 J 落地记录（2026-09-26）

- **范围比原清单大**：落 `api-job-controller` 的前置是上游「jobs seam 收敛」（Note `2026-09-03-jobs-seam-consolidation`）。实际落地：`jobs/jobs` 新增 `view.ts`/`archive-admission.ts` 并重写 `types.ts`/`index.ts`；`jobs-local` 新增 `ring/pump/events`；六个生产者外科式改造（`tool-jobs`+`render.ts`、`tool-bash`、`tool-pwsh`、`tool-terminal`+`background.ts`、`subagent/*`、`tool-workflow`+`record.ts`）；新包 `api/job-controller`（Host `ctx.jobController` + 生成式 client `ctx.jobs` + 7 spec + 双语 README）；`client/ui-jobs` 重写（实时输出面板 + 两击确认 stop）；`client/ui-sidebar-tasks` 迁移；**`session/jobs` 帧退役**并清理全仓 42 处 `jobsBySession` fixture；bundle/tsconfig 接线；`docs/subsystems/jobs.md` 全量重写。
- **验证**：8 包 **720 passed / 8 skipped**；`tsc -b` 双面零错误；`test:docs` 20/20。
- **过程中的两个根因**：① Typert 生成器拒绝 `@qilin/jobs/view` 跨包引用，实为 `tsconfig.base.json` 生成式 paths 别名缺条目（补 4 条手写别名即可，无需偏离上游写法）；② `verify-kylin-catalog` 的 `SERVICE_PAGE` 值被误写成整句说明而非页名（应为 `jobs.md`），我已修正；另 `ctx.developerTools` 属既有 partition 缺口（声明文件未改），按生成器指示补入 `serviceWalkExemptions` 并注明文档归属。
- **未移植**：`promoteOnTimeout`（前台超时转后台，需动 shell seam）、`live-job-stream.e2e.ts`、C2 的 `step-process.e2e.ts`；`background-job-list.e2e.ts` 已改签名但未跑真机。

### 批次二提交与整波复验（2026-09-26）

**提交**：批次二（`feat: 对齐上游 dsh 0.1.7-rc.2——门禁盲区/jobs 远程面/过程分组/配置 schema 与 Config inspect`）。

**复验结果**

| 项 | 结果 |
|---|---|
| 门禁扫描（route / no-unknown-casts / package-meta / package-dependencies / client-catalog / kylin-catalog / module-graph / doc-graphs / export-jsdoc / plugin-packages） | 全 PASS |
| `test:docs` | 20 passed / 0 failed |
| `tsc -b tsconfig.client.json` / `tsconfig.host.json` | 零错误 |
| `pnpm run test:gui` | 521 文件中 **520 通过**；7729 测试通过 / 1 失败（见下） |

**过程中修掉的门禁红**：① `verify-kylin-catalog` —— J 把 `SERVICE_PAGE.jobController` 的值写成整句说明而非页名（应为 `jobs.md`），另 `ctx.developerTools` 属既有 partition 缺口（声明文件未改），按生成器指示补入 `serviceWalkExemptions` 并注明文档归属；② `verify-package-dependencies` —— ui-chat 缺 `@qilin/brand`/`@qilin/util-values` devDependencies（C2 引入），已 `--fix`；③ `verify-no-unknown-casts` —— 16 处**既有** `as unknown` 因夹具新增必填属性而指纹变化（逐文件计数与 HEAD 相同，无净新增），按门禁自身写路径重采基线（642 文件 / 1361 条，断言 1691）；④ `verify-plugin-packages` —— 新包入列后重生成；⑤ 提交前清理 **44 个被 `git add -A` 误纳的编译残留**（`.d.ts` 直写 `src/`）。

**既有红（非本批引入，已逐条核实）**

- `client/ui-trajectory/tests/views.client.spec.tsx` 1 例失败（"marks an unloaded history prefix…"，focus 后取不到 tooltip）。核实方式：把 spec 临时还原到 HEAD 复跑，**同样失败**；且 `ui-primitives` 的 Tooltip 与该包子代自批次一以来只有 barrel 新增导出，未改行为。
- `client/ui-approval/tests/ui-approval.client.spec.tsx` 测试全绿但抛未处理拒绝（`test invariants: invariant service settled without becoming active`），单独跑同样出现；该包未被本波触碰。
- `test:snapshot` lane 仍因无关 stderr 断言（`deepseek-official` 适配器重复注册）整体不可用，需有 key 环境。

### 既有红清单（与本轮对齐无关，逐条核实过，供裁决）

| # | 位置 | 症状 | 核实方式 |
|---|---|---|---|
| 1 | `packages/client/ui-trajectory/tests/views.client.spec.tsx` | "marks an unloaded history prefix…" focus 后取不到 tooltip | 把 spec 临时还原到 HEAD 复跑同样失败；单独跑该文件仍失败、`-t` 单跑通过 → 文件内状态/顺序缺陷 |
| 2 | `packages/client/ui-approval/tests/ui-approval.client.spec.tsx` | 15 例全绿但抛未处理拒绝（`invariant service settled without becoming active`） | 该包未被本波触碰；单独跑同样出现 |
| 3 | `scripts/session-fixture-layout.spec.ts` | 1/29 失败（`preserving source reference order`） | 文件未被本波触碰 |
| 4 | `scripts/session-snapshot-corpus.corpus.ts` 的保留角色断言 | 硬写 `retainedRoles: 11` vs 实得 10 | 加/不加 C4 的 scenario 都是 10 |
| 5 | `test:snapshot` lane | 因 `llm-deepseek` 与 `llm-deepseek-api-key` 都注册 `deepseek-official` adapter 而整条不可用（对照组 `-t text-turn` 同样失败） | 需有 key 环境复验 |
| 6 | `apps/web/tests/tool-details.e2e.ts` + `snapshots/web/tool-details/*`（本波新增） | 未真机回放（树当次 client typecheck 不过，无法重建 web dist） | 提交前需 `QILIN_SNAPSHOT=refresh` 重录，否则先不入库 |

**已在本轮修掉的既有红**：`source-artifacts` 门禁未接线、`replaceWindow` JSDoc 错位、`ui-settings` 依赖归类、`ui-open-in-app` bench 缺服务、`gen-client-catalog` 缺 `@example` 分支、`ctx.developerTools` partition 豁免、ui-chat 依赖缺项。

### 批次三（下批建议第 4/5 项 + 覆盖率补测）

**C3 侧边栏与会话基础设施（5 项落地 4 项）**

1. **会话置顶全链路**：Host `workspaceController` 的 `pinSession`/`unpinSession` Remote + `pinned` follow 增量 + 归档丢弃置顶；客户端 model/service 的 pin 集与回显；ui-workspace 行菜单/悬停按钮/尾随标记 + 派生期置顶前置 + 手动顺序写回；ui-primitives 补 pin 字形。QiLin 无上游的 `sidebar.workspaces.session.menu.item`/`row.action` 槽体系，按现有「行内菜单 + 悬停按钮」适配。
2. **常驻会话头部**：新增 `conversation.header`（session-maybe）与 `conversation.header.leading`（root），`ConversationHeader.tsx` 无条件渲染；ui-sidebar 导航控件迁到新 root 席位。
3. **侧边栏视图引用**：`session-view.ts`/`session-views.ts`（每 View 独立持有 Session reference、`retainTab` 保活、retire/mount 生命周期）+ 多子树渲染 + `active` 列宽门控 + `keepMounted`。**上游 `focus.ts`/`close-focus.ts` 跳过**：调用点分布在 QiLin 未对齐的 `service.commandTarget` 与 seat 注入上，单独移植会成无 owner 死代码。
4. **停靠稳定标签容器**：`TabLayout`/`DockLayout`（平坦 Grid、浮动同树、`keepMounted`/`active`、焦点交接、非法树形抛错），右侧栏 `SidebarPanel` 切到 `DockLayout`。
5. **文件树目录监听：未做**。上游依赖按路径的 OS 级 watch（`workspaceFiles.changes(scope, path, signal)`），QiLin 的 `workspace-files.changes(scope, signal)` 只转发 `fs/observed`（无 watch），忠实移植需新增 `fs watch` 能力 seam（Host + provider + Remote + 测试），超出本簇 → 如实跳过，列作独立缺口。

**C4 工具详情卡**：`ToolDetails` + 4 个 detail model + `details-row`（37 keyed 注册）+ `todo-diff-model`/`todo-history`；`ToolRow` 在 C2 之上外科式加 `details`；恢复 37 个 `tool.title.*` 映射；ui-conversation 词典补 201 键。**顺手修掉既有回归**：`scripts/gen-client-catalog.ts` 丢了上游 `@example` 分支（仓库自带 spec 在 HEAD 即红）。catalog 预算所限把 `tool.call.toolview` 槽 JSDoc 13→6 行（summary 首句未变）。

**覆盖率补测（纠错）**：C2 报的 5 个「缺渲染 spec 会红门禁」文件实测**都在 `vitest.config.ts` 的豁免名单里**（与上游逐行相同）。真正卡门禁的只有 `contract/chat-visibility.ts` 的分支 85.71%（`permission` command 分支从未求值，因移植时裁掉上游同名用例）→ 按行为语义补回，**分支 7/7 = 100%**，未加任何 `v8 ignore`。另按「上游是否有具名 spec」对齐：移植上游 `scroll-follow.client.spec.ts`（11 例），并把上游藏在 `chat-view` 集成用例里的覆盖面落成 `group-seat.client.spec.tsx`（13 例）。

**过程中修掉的生成器红**：`verify-kylin-catalog`/`verify-doc-graphs` 因 C3 新增 `WorkspacePinSessionRequest`/`WorkspaceUnpinSessionRequest`/`WorkspacePinValue` 三个类型未分类而红 → 补入 `linkedTypePages` 并重生成两份产物。

**既有红新增**：`verify-client-domain-graph` **38 处违规**（`skeleton→input`、`view→browser`、`text→document` 等），已逐条与工作树改动求交：**0 处涉及本轮改动的文件**，且门禁脚本本身未改 → 纯既有红；`test-support/client-runtime` 的 `assembly-test-client` ResizeObserver 泄漏（用 HEAD 版本复现）。

**最终验证（批次一收尾）**：门禁 spec 合并跑 `314 passed | 1 skipped`；`run-gates.spec` 107/107；`test:docs` **20 passed / 0 failed**；`verify-plugin-packages` up to date；`tsc -b tsconfig.client.json` 与 `tsconfig.host.json` 双面 exit 0；plugin-manager + ui-primitives 1165 测试绿；ui-settings-models + ui-conversation 746 测试绿；agent-presets 195 测试绿。
_（历史条目：门禁盲区四处与 `useDisclosure?` 那条红均已在批次二/三中修复，见下文。）_

### 批次三提交与复验（2026-09-26）

**提交**：批次三（`feat: 对齐上游 dsh 0.1.7-rc.2——会话置顶/常驻头部/停靠标签/工具详情卡/覆盖率补测`）。

**复验**：门禁 11 项全 PASS；`test:docs` 20/20；`pnpm run build` 成功（282 个客户端产物）；`test:gui` 527 文件中 525 通过、7809/7812 测试通过（2 条既有红）；双面 typecheck 干净；提交前清掉 6 处超长行与 3 处 EOF 空行。

**web e2e lane 需要专门一波适配（重要）**：C2 把过程行放进**默认折叠的组容器**，`expandOwningTurnProcess` 的全部调用方（10+ spec）在旧形态下失效。已让 helper 变成「先展开 Turn-process，再展开所属组 seat」（`data-chat-group-key` → `[data-process-activity]`），把 `tool-details` 从「2 skipped」推进到「1 passed / 1 failed」；**断言层仍需按分组 DOM 逐条校准**。`apps/web/tests/tool-details.e2e.ts` 与 `snapshots/web/tool-details/` 已暂移到 `/tmp/qilin-pending-tool-details/`（其断言假定 `create_goal` 行展开后出现 `listitem`，实测 0），待适配后再入库。

**剩余工作清单（按依赖排序）**

1. **web e2e 适配批次**：分组 DOM 断言 + `tool-details` 断言 + `step-process.e2e.ts` + `live-job-stream.e2e.ts` + `background-job-list` golden 真机回放。
2. **C3 未做**：`focus.ts`/`close-focus.ts`（前置：对齐 `service.commandTarget` 与 seat 的 focus 注入）→ 与 `shortcuts-panels` e2e 同波；**文件树目录监听**（需新增 `fs watch` 能力 seam）。
3. **J 未做**：`promoteOnTimeout`（前台超时转后台；模型可见新行为 + 新 Config 字段，需动 shell seam）。
4. **C2 半落地（已更正）**：`isVisibleChatNode` 的过滤语义已落地并被分组消费，但**可见序**未采用（`orderedVisibleChatNodes` 仍按 `visibility` 驱动，README/注释已标注）。若要与上游完全一致，需把该过滤接进可见序、并同步前段注入行的锚点排序；这会影响正文行是否出现，属**用户可见的产品决策**。
5. **第二层声明式 preset**：四项前置（CLI `--dump-config-schema`；`Profile.skippedBundles`；**决定 preset 行是否进 Loader 树**；patch 定向 id 语义）。
6. **路由盲区**：`packages/client/connection/src/client/rpc.ts` 仍用 `location.origin`。
7. **既有红**：见上文既有红清单（6 条）+ `verify-client-domain-graph` 的 38 处域层级违规。

### 批次四：web e2e 泳道适配（2026-09-26）

**起因**：C2 把过程行放进默认折叠的组容器，`expandOwningTurnProcess` 的 13 个消费 spec 的可见性前提失效（replay 起步为 12 文件失败 / 33 failed）。

**方法学教训（我自己的）**：我一度对 13 个 spec 直接跑 `QILIN_SNAPSHOT=refresh`，把**折叠态**拍成了 golden（明细行退化为组头 `Read files`、`Context injection AGENTS.md` 行消失）。已**全部回滚**。规则：判读/刷新 golden 前，页面必须处于 spec 名称所声明的状态（`ui-expanded` 就得是展开态），且每条 diff 要能解释。

**修掉的四个用户可见真缺陷**

| # | 缺陷 | 根因 | 修复与证据 |
|---|---|---|---|
| D1 | 已选会话下刷新页面 → **整屏 "Failed to load plugins"** | 持久化的主选中项活得比 catalog 久：恢复窗口时它指向的 Session 其列表行尚未到达，`SidebarSessionViews.select()` 对未列出的会话 retain 时抛错 → `ui-sidebar-right` fiber 失败 → `sidebarRight`/`sidebarRightTabs` 永不提供 → 其余 13 项 pending | `ui-sidebar-right` 仅在会话已列出时 retain，并同时跟随 catalog 订阅；`boot-client` 增加失败 fiber 的 `_error` 诊断 |
| D2 | 展开过程组后**同一步回复渲染两遍**（Think… + DONE 重复） | 上游 `AssistantMarkdown` 的 `groupPart` 块过滤与 `AssistantNodeView` 透传整段漏移植（`git log -S` 证明该字符串在本仓历史从未存在） | 补回 prop + 两行 `continue` + 透传；新增座位级回归测试 `assistant-process-portions.client.spec.tsx` |
| D3 | `todo_write` 的 2 行挂不出结构化详情 | C4 移植不完整：`todo-row.tsx` 未接 `todoDiffModel`/`registerTodoHistory`，两个模型成死代码（README 早已描述该行为） | 按上游接线 + 恢复上游单测断言（checklist 3×listitem、注入面、`spec.inject`） |
| D4 | 从回合页脚分支出的子会话**丢掉 `step/end` 与 `turn/end`** | `TurnTailNodeView` 用 `closing.finalNode.seq` 而非上游的 `data.seq`(= `turn/end`)；缺失位置由 `openTurnClosers({kind:'forked'})` 合成顶替 | 改为 `forkAt(data.seq)`；实测前缀多回 `seq 640 step/end` + `seq 641 turn/end`，`inheritedEventCount` 640→642；单测断言同步为与上游逐字相同的数字 |

**B2 ChatView viewport**：不移植上游整套 viewport 模块，在现有 `ChatView` 内做定点补偿（+29/−2）：新增 `readerAnchorRef`（读者自身采样点；原 `anchorRef` 只在分页在飞时有值，不可复用）与 `preserveRef`，挂到既有 ResizeObserver，实现上游 `use-chat-viewport.preserve()` 的「提交或后续尺寸变化后保留一个分页锚点」契约 → `chat-scroll-contract` 7/7（该用例 12.7s 失败 → 5.7s 通过）。余量：组内 body 内层滚动补偿、`use-chat-reading`/`use-chat-navigation` 的采样与跳转重构仍未移植。

**既有红新增**：① `cordis-tool-round.e2e.ts` 的常量仍是改名前的 `kylin-tool-round`/`kylin-history`（目录已改 `cordis-*`）→ ENOENT；② `chat-scroll-contract` 的 `expect(header.version).toBe(3)` 是会话格式 3→4 升级遗留（上游同处用 `SESSION_FORMAT_VERSION`）；③ `skill-tool-row` 的 Instructions 段落取自**共享录制 fixture**（内含 DSH 时代文本 `{{cwd}}/.dsh/skills` 等），而 golden 已被 rebrand —— 需**有 key** 重录该 fixture；④ `ptc-round` 的 prompt pin 有 **12 处**陈旧（`@` 路径文案、`job_*` 文档改写、`list_agents` 的 `idle/ready`→`inactive`、内嵌 TS 声明等），**keyless 可刷**。

**共享 helper 走样（本批第二个"根因级"发现）**：上游 `support.ts` 的 `expandTurnProcesses` 与 `scaffold.ts` 的 `captureExpandedTurnProcessAria` 用的是**双选择器** `'[data-turn-process], [data-process-activity]'`（同时展开 Turn-process 与分组头），QiLin 只展开了前者。后果：`ui-expanded` 类快照会把**折叠组**当基线、靠展开才可见的行（如 `Think`）找不到。按上游逐字对齐后：`replay-round-trip` 的 Think 折叠用例 **30s 超时 → 41ms 通过**，该 spec 8/8；`fresh-round-trip/ui-expanded` 重刷后与上游同名 golden 形态一致（`button "Ran commands" [expanded]` + 三条明细行）。

**golden/pin 刷新（均逐条解释）**：`ptc-round`（prompt 12 行 + ui golden，与上游同名 golden 一致）、`fresh-round-trip`（prompt 1 行 + schema 26 行 + ui-expanded）、`stats-paged-history`（28 个同形 hunk，全部是批次二的分组头 `Thought for a while`）。pin 差异归四类：(a) `@` 路径文案；(b) 状态语义 `idle/ready`→`inactive`；(c) `job_*` 工具文档改写；(d) `sandbox_permissions` justification 双句点；另发现 (e) **workflow 工具 inputSchema 新增 `run_in_background`**（簇 J 的真实产品变化）。`cordis-tool-round`/`schedule-catalog` 的 pin 处于「陈旧但无人断言」状态，**未去激活该断言**（避免扩范围）。

**ChatView 回归证据**：`trajectory-virtualization` 1/1、`schedule-after` 8/8、`stats-paged-history` 3/3（刷新陈旧 golden 后）。`complex-history.perf`（opt-in、非 CI）3 条失败发生在 **fixture 解析阶段**（`session-format-v3-to-v4/relationships.ts` 报 `system/message requires a protected first surface head`），与滚动无关，属 v4 迁移遗留红。

**D5 证伪（重要）**：原判「reload 后右侧栏 tab 体不挂载」经探针证伪——**不是缺陷**：点文件/skill 链接触发的是**编辑器 tab**（批次三「引用文件改为可编辑打开」），dock 只挂载**活动 tab** 的体（非活动 tab 的 body `childElementCount === 0`，属设计）；预览 tab 为活动 tab 时 reload 恢复完全正常。修法全在 spec 侧（补「Preview」手势、reload 用例围绕预览 tab 断言）。

**(a)/(b) 两条断言的收敛**：(a) 轨迹账本几何改写为右侧栏 dock 契约（保留 `paneOverflowX`/`paneScrollableWidth`、新增 `ledgerScrollSeat`；删掉的两条——会话滚动宿主 relative 与 composer seat absolute——逐条写明「输入框不会进入右栏，无等价物」）；(b) header 下载入口是批次三既定移除，用例收敛为只覆盖仍存在的 `/export` 斜杠路径（保留 ZIP 内容与命令生命周期断言）。

**收尾复验（提交前）**：12 项门禁全 PASS（含 `verify-repository-references`）；`test:docs` 20/20；双面 `tsc -b` 零错误；**17 条受影响的 e2e 全绿**（86 passed / 2 skipped，另修掉 `ptc-round` 最后一处过期轨迹入口定位后 7/7）；staged lint 0 error、whitespace 干净。
**提交**：`fix(client): 修 reload 挂死/过程组重复渲染/分支锚点/todo 详情，并适配分组后的 web e2e 泳道`（46 文件，+1635/−247）。

**仍未覆盖/未做的**：web 泳道其余约 107 条 spec 本次未跑（只跑了受分组影响的 17 条）；`cordis-tool-round`/`schedule-catalog` 的 pin「陈旧但无人断言」；`complex-history.perf` 的 v4 合成日志失败（opt-in 非 CI）；`navigation-panes` 头部下载面已按产品移除收敛。

**其它处置**：`snapshots/web/**/session.v4.jsonl` 是 jsonl 持久化打开历史代时发布的兄弟文件（每次运行都重生成，`snapshots/web/**` 无消费者）→ 已加入 `.gitignore` 并删除现有 3 个；`snapshots/session/*` 里 4 个受跟踪的 v4 保留。另：新回归测试里 family C 引入的一处 `as unknown` 被 `verify-no-unknown-casts` 拦下，已改成 `makeTranslate(zh, commonZh)` 显式类型。

---

## 独立项目：web e2e 泳道复原（2026-09-26 起）

### 存量规模与归因（已用实验证明，非估计）

全量 replay（`QILIN_SNAPSHOT=replay pnpm run test:web:built`，串行 43.8 分钟）：

| 指标 | 数值 |
|---|---|
| 文件 | **72 failed / 55 passed / 1 skipped（128）** |
| 测试 | **135 failed / 297 passed / 29 skipped（461）** |
| 失败形态 | `AssertionError` 62、`TimeoutError` 52、其余零星 |
| 去重后的失败文件 | **41 个**（日志里的 72 含进度重复行） |

**归因实验（决定性）**：把仓库切到**批次一之前**的提交（即「设置页恢复整页布局，撤回模态框化」那一条）、`pnpm run build`（exit 0）后跑 6 个代表性 spec，与 HEAD 逐文件失败数**完全一致**：

| spec | 批次一之前 | HEAD（批次四之后） |
|---|---|---|
| settings-chrome | 10/12 失败 | 10/12 |
| voice-download | 5/5 | 5/5 |
| preview-boot | 1/1 | 1/1 |
| default-product-isolation | 1/1 | 1/1 |
| access-confirmation | 4/6 | 4/6 |
| plugin-manager | 4/6 | 4/6 |

→ **结论：这些红是存量欠账，与本轮对齐工作无关**。本轮只把「受分组影响的 17 条」修绿（已提交）；泳道其余部分从未在此状态下绿过。

### 典型根因（按报错形态）

1. **定位器/前提过期**：fork 自己的产品改动让入口与可访问名变化。例：`settings-chrome` 仍在等头部 `设置` 按钮，而批次三已把设置入口移入 Account 行；`navigation-panes` 仍在等 `More actions`（已随轨迹迁移移除）。
2. **golden 落后于历史产品改动**：输出合法变化但基线未更新。
3. **被 D1 掩盖的断言过期**：D1（reload 挂死）修复后，一批 reload 类用例从"跳过/超时"转为暴露真正的断言问题。
4. **少数环境性**：无网、端口或并发导致的超时（需证据，不得当作真缺陷修）。

### 推进方式（每波固定流程）

**跑该区域 → 逐条定性（定位器过期 / golden 落后 / 真缺陷 / 环境）→ 只修真缺陷与合法过期 → 复跑 → 提交**；**禁止盲刷 golden**（本轮已证明盲刷会把折叠态/退化写成基线），golden 刷新必须逐条解释 diff 且页面处于 spec 名称声明的状态。

**优先级与波次**

| 波 | 范围 | 状态 |
|---|---|---|
| 1 | settings 壳层 + 模型/引导 | **已完成**（`fix: web 泳道复原波1+2`） |
| 2 | `plugin-*`、`sidebar-*`、`markdown-*` | **已完成**（同波 1 提交） |
| 3 | `voice-*`、`model*` 余项、`message-*` | **已完成**（`test(web): 泳道复原波3`；`fix(client): 恢复 composer 的 conversation.input.activity 渲染席位`） |
| 4a | team / subagent | **已完成**（`test(web): 泳道复原波4a`） |
| 4b | 引导 / 预设 | **已完成**（`test(web): 泳道复原波4b`） |
| 4c | 文档 / 文件面（可编辑 workbench、轨迹迁移） | **已完成**（`test(web): 泳道复原波4c`） |
| 5 | preview 宿主 http shim、搜索关闭竞态、账号门禁 | **已完成**（`fix+test(web): 泳道复原波5`；`fix: 预览宿主无 worker`） |
| 收口 | root 槽热替换崩根（见下节 D6） | **已完成**（`fix: 客户端热替换的静默期不再炸 React 根` + 对应 Agent Note） |

上表括号内即提交 subject，可用 `git log --oneline` 检索；本仓未 push、未打 tag，故不写裸 hash（`verify-repository-references` 会拒绝）。

说明：`settings-chrome` 与 `deepseek-messages-settings` 含 reload 场景，D1 修复后它们正常启动，余下差异才是真实断言问题——已按此定性并修完。

### 本波踩到的三条工程坑（写给后续所有泳道）

1. **不要把探针放进 `apps/web/tests/`**：`apps/web/tsconfig.json` 是**逐条 exclude** 每个 e2e spec 的，任何新增的 `apps/web/tests/*.e2e.ts` 只要 import 了被排除的 `./scaffold.ts`，就会把 host 面的 scaffold/test-support 源拉进 client program，触发一片 `TS6059/TS6307/TS2339`，`build:lib` 直接 exit 2，整条 `pnpm run build` 走不到 `build:web`。本波为此被卡两次。探针请放仓外或用 `tsx` 一次性脚本；**也正因如此，不要用 `build:web` 单独绕** —— 那会让客户端构建记录（public values + 产物 digest）与产物不一致，等于在"基线不可信"下刷基线。
2. **在途也不要让 spec 处于"不编译"状态**：这些 e2e 文件会被 client/host program 编译到，保存一次就会挡住**所有**泳道的 `pnpm run build`。调试代码（例如在 `evaluateAll` 里用 `Element.hidden`）用完即删。
3. **全仓 `tsc` 会把编译产物直写进某些包的 `src/`**：本波一次性产生 61 个（`packages/test-support/*` 48、`packages/settings/settings` 12、`packages/api/job-controller` 1）。清理判据：扩展名属产物（`.js/.d.ts/.js.map/.d.ts.map`）**且**同基名存在受跟踪的 `.ts`/`.tsx`；**注意别误删未跟踪的源文件**（例如另一路新增的 `packages/core/agent-loop/tests/settings.spec.ts`），也**不要用 `git add -A` 盲扫**。

### 泳道收口：root 槽热替换崩根（D6，真缺陷）

**现象**：页面偶发整屏 `SlotAssemblyError: renderSlot('root') before any 'root' registration (boot order)`（React 会 `recoverFromConcurrentError` 重试，替换到达后自愈，因此表现为偶发；`file-upload-round` 5 次运行命中 1 次）。

**排除的错误假设**：先怀疑「名册稳定前渲染 app 树」。插桩 500+ 次浏览器/jsdom 启动后证伪：`mount` 调用点唯一且恒在 `loader.await()` + `assertEntriesActive` 之后，启动期 `root` 注册恒为 1。

**真实触发链**（宿主 `packages/client/hmr/src/index.ts:118`）：每 500ms stat-poll 每个 client bundle → mtime/size 变化 → `clientModules.rebuilt(id)` → SSE `rebuilt` 帧 → 页面 `entries.reload` → `replace(entry)` 重建该 entry 的 fiber，其 effect 全部 dispose；若被替换者是 root 占位者（ui-layout）或其 inject 链上的服务提供者（theme/locale/shortcuts/settingsScope…），级联会在应用仍挂载时 dispose 掉 `root` 注册 → 已挂载的 `RootOutlet` 经版本订阅重渲染看到 `entries=0` → 抛错。确定性复现：浏览器内 touch `packages/client/ui-theme/lib/client.js`（逐帧日志：`root registered` → `mount` → `theme unload` → `layout unload` → `root DISPOSED` → `RootOutlet render entries=0` → pageerror）。

**修法**：`RootOutlet` 增加「已成功提交过 occupant」的 latch（无依赖 layout effect 内条件置位）。**首帧渲染仍 fail loud 抛 boot-order**，ctx 级 `renderSlot('root')` 守卫与既有 boot-order 断言（`scoped-slots.client.spec.tsx:305`、`registry.client.spec.ts:585`）全部保持响亮；只有挂载成功之后的空档改渲染 crash face（crash face 不是静默空白——替换到达即自愈）。决策依据见 Agent Note `2026-09-26-root-slot-lifetime-transition`。

**证据**：新增 ui-renderer 单测（修复前因 SlotAssemblyError 失败）+ 新增 `client-plugin-live` e2e「rebuild 替换 root 占位者」（修复前 30s 未恢复、修复后 676ms 通过，且断言宿主 graph rev 变化以防真空通过）；文件 `ui-renderer`+`client/web` 单测 190 passed、live e2e 6 passed、`pnpm run build` 通过。

**方法论留档**：安静环境下 5/5 + 30 次 + 72 次压力循环全部 0 命中——**偶发竞态必须造出真实触发事件才能复现与验证**，"跑很多次没复现" 不构成该竞态不存在的证据。

### 后续三步（A/B/C，本轮计划的剩余部分）

| 步 | 内容 | 状态 |
|---|---|---|
| A | `TurnProcessNodeView` 按上游 rc.2 整体对齐（实时时长标签 / `turnProcessAlwaysOpen` / `hasContent` / `disabled` / 仅可折叠时渲染 chevron / visually-hidden `role="status"` 宣布）+ 其 golden 刷新 | **已完成**（净新增失败 0，见下节记录） |
| B | 图标 `aria-hidden` 对齐 + golden 去噪（**严格不变量：每条 diff 只允许是图标离开可访问性树**） | **已完成**（87/87；137 个 golden；不变量校验 0 未解释） |
| C | 全量 128 文件泳道跑一遍，给出最终数字 | **已完成**（基线 + 最终各一次，见 Step A 收口复验） |

A 与 B 拆成两趟刷新，保证 diff 可归因（各自都有「改动前基线 vs 改动后」的全量泳道对照）。

**Step B 的规模已实测（不是估计）**：QiLin `packages/client/ui-primitives/src/icons/index.tsx` 共 87 个 `<svg>`，仅 6 个带 `aria-hidden`；上游 rc.2 同文件 87/87。golden 噪声为 2123 条裸 `- img` 行 / 167 个文件（apps/web/tests/expected 789 + snapshots 1334）。关键细节：上游 rc.2 的 golden 里仍保留 25 条带访问名的 `- img "…"`（markdown 真实图片、带 alt 的状态图），所以去噪只能删「裸 - img」——这是 Step B 必须守住的唯一不变量。

### Step A 落地记录：TurnProcessNodeView 按上游 rc.2 整体对齐（2026-09-26）

源改动（packages/client/ui-chat）：

| 文件 | 改动 |
|---|---|
| src/client/chat/TurnProcessNodeView.tsx | 换为 rc.2 原文；QiLin 侧只改 import 前缀与图标名（上游 IconChevronDownOutlineRegular，QiLin 只有 IconChevronDownOutline14） |
| src/client/chat/TurnProcessNodeView.module.css | 随之上游化：高度随 --qilin-content-font-delta、标签用 --qilin-content-font-size-secondary、补 disabled/hover 态、chevron 14px 且展开 rotate(180deg) |
| src/client/chat/message-chrome.ts | 补 LIVE_RUN_CLOCK_INTERVAL_MS 与 formatLiveRunDuration（rc.2 原文含 JSDoc）；保留 QiLin 本地 formatLatencySeconds（TurnUsagePanel 在用，上游无此函数） |
| src/client/locale.ts | zh/en 各补 message.turnProcess.{worked,deepDivingFor,took,failed}；品牌沿用 QiLin 对 chat.deepDiving（= QiLin...）的处理：zh「QiLin...，用时{duration}」/ en「QiLin... for {duration}」 |
| tests/chat-view.client.spec.tsx | 旧行为断言按新行为改写；新增 formatLiveRunDuration 边界覆盖 |
| README.md / README.zh.md（含 README.i18n.yaml 重录） | 原段落写「控件汇报三项计数、全为 0 时显示『已思考』」，随行为作废；改写为「标题汇报轮次状态/时长、计数只留在数据属性上供测试、无外部过程也无内联推理时控件禁用且行留给页内查找」 |

行为变化：标题由计数改为轮次状态/时长（运行中「QiLin...，用时 Xs」，结算后「用时 Xs」/「已完成工作」/「已停止」/「处理失败」）；新增 visually-hidden role=status 宣布；disabled={!canCollapse}；aria-expanded 仅在 hasContent 时存在；chevron 仅在可折叠时渲染；运行中每秒 tick 刷新时长。

未带入 KCoder 分支的深蓝扫光补丁（data-turn-running + shimmer CSS）：那是 kcoder fork 的自有改动，不属于 rc.2。

**推论：ChatNodeSeat 早已对齐**（避免重复移植）：组件消费的 hasContent / foldable / open / setOpen 由 ChatNodeSeat 提供，两树 diff 除 import 改名、格式与 QiLin 的 toolDetail 增项外，hasContent 表达式与 rc.2 逐字相同。「无外部过程且无内联推理 → 没有可折叠内容」的语义本已在 QiLin 生效，缺的只是组件侧据此渲染禁用态与省略 aria-expanded。

**连带修正的四处过期**（不是回归）：

1. 十条 ui-chat 单测断言写死旧计数标题（「1 次工具调用 · 1 条消息 · 1 个 subagent」「已思考」）与「点击即可展开 Context」的前设。按新契约改写：折叠态改用 data-open（因为 aria-expanded 在无内容时按上游契约不再出现）；只有 Context 行、无外部过程的轮次不再可点开，断言改为「控件禁用、行保持 until-found」；两处「/用时 /」文本查询因控件标题也含「用时」而与尾部用时药丸撞名，改为在 [data-turn-tail] 作用域内查询；两条用例标题从「计数全为 0 时的兜底标题」改为「无计时时的 worked 标题」。
2. 既有 helper 缺陷（本步暴露）：apps/web/tests/support.ts 的 expandOwningTurnProcess 用 aria-expanded !== 'true' 判「需要点开」。遇到 aria-expanded 缺失（无内容）且按钮禁用时会去点一个禁用按钮，Playwright 会一直等它变为可用 → 30s 超时（chat-scroll-contract 的 keeps streaming ownership 用例 31.3s 超时即此）。上游同函数写的是 aria-expanded === 'false'；旧标记下永远不命中，因为旧按钮从不禁用。已按上游语义修正。
3. 定位器过期：clickable-links-gallery 与 skill-user-invoke 写死旧计数标题（`button "2 tool calls"` / `button "Thought for a while"`），改为按 `[data-turn-process]` 定位；后者因「只有 Context 注入的轮次不可点开」改用产品自身的 find-in-page `beforematch` 揭示路径，并在最终 golden 前用 reload 回到默认折叠态。
4. getByRole('status') 撞名：控件新增 visually-hidden `role="status"` 宣布后，页面上出现第二个含「QiLin...」的 live region（另一个是 ChatView 可见的 turnStatus）。live-interactions / turn-tail-actions 两处断言改为取 `div[class*="turnStatus"]`；sidebar-terminal 的终端状态快照加 `[data-sidebar-terminal]` 作用域。**双 live region 本身留作待决策项**（见文末），本步先按上游整体对齐、不擅自删 QiLin 的可见状态行。

**归属方法（先测基线，再归因）**：把 Step A 的全部改动 stash 掉，在 HEAD 原状重新构建后跑一次**全量 replay 泳道**，再与带改动的全量结果按「文件 :: 用例」做集合差。两次都是同一命令（`QILIN_SNAPSHOT=replay pnpm run test:web:built`）、同一构建流程。

| 指标 | 基线（HEAD 原状） | 带 Step A（刷新 golden 前） |
|---|---|---|
| 文件 | 27 failed / 100 passed / 1 skipped（128） | 54 failed / 73 passed / 1 skipped |
| 用例 | 38 failed / 408 passed / 17 skipped（463） | 77 failed / 369 passed / 17 skipped |
| 耗时 | 约 11 分钟 | 约 11 分钟 |

集合差结果：**基线红的用例全部仍然红（ONLY-BASELINE = 0）**；新增红 **42 条**，其中 36 条是 golden 比对、6 条是连带的二级失败（steering / subagent-interrupt-ui 的 `llm-replay: fixture not fully consumed` 是测试提前失败导致录制调用没走完；sidebar-terminal 是上面第 4 条的 status 撞名；feedback-release 的解析噪声）。**没有任何文件同时含「既有红」和「Step A 新增红」**——所以可以只对新增红那 27 个 spec 做定向刷新，不会碰到既有红。

**golden 刷新（定向，27 个 spec → 54 个 golden 文件）**：`QILIN_SNAPSHOT=refresh npx vitest run --config vitest.web.config.ts <27 spec>` → 27 文件 / 148 通过。刷新后 diff 为 **+214 / −226**，把全部 442 条变更行按类别归口：按钮行 176、标签文本行 126、aria `status` 行 88、图标/空行 50，**未归口 0 条**。按钮行的增删是封闭集合：删掉的全是旧计数标题（`Thought for a while` 40、`1 tool call` 14、`1 tool call · 1 message` 4、`2 tool calls` 3、中文两处…），新增的全是时长/状态标题（`Took {{duration}} [disabled]` 38、`Took {{duration}} [expanded]` 20、`QiLin... for {{duration}} [disabled]` 5…）。

**与上游 goldens 的形状对照（关键验收）**：上游 rc.2 自己的 golden 里同样是 `button "Took {{duration}}" [disabled]` ×49、`[expanded]` ×29、无标记 ×21、`"Deep diving for {{duration}}" [disabled]` ×12——**禁用/展开的分布与 QiLin 刷新后一致**，差异只在 QiLin 的品牌运行文案（`QiLin... for {{duration}}` / `QiLin...，用时`）。这说明「无外部过程且无内联推理 → 控件禁用」是上游真实行为，不是移植偏差。

**Step A 收口复验（全量泳道，刷新后再跑一次）**：`27 failed / 100 passed / 1 skipped`（文件）、`38 failed / 408 passed / 17 skipped`（用例）——**与基线逐字相同**；两边的失败文件集合做集合比较结果为 `identical sets: True`（only-in-final 与 only-in-baseline 均为空）。即 **Step A 净新增失败 = 0**，剩余红全部是既有欠账。

**既有红清单（27 文件 / 38 用例，基线与最终一致；本步不修）**：
agent-preset-authoring、approval-composer、background-job-list、bash-abort-row、built-boot.expected、clickable-links-gallery、command-image-envelope.expected、github-ready-review、goal-multi-turn-actions、home-path-tilde.expected、image-display.expected、markdown-cjk-strong、markdown-inline-code-links、math-rendering、max-tokens-notice.expected、minimal-preset.snapshot、preset-migration.snapshot、queue-actions、queue-image、search-card.expected、streaming-fence-highlight、submission-echo、todo-row.expected、trajectory-image-display.expected、voice-input、window-drag-coverage、workflow-run。

失败形态归三类：(a) 组装态夹具级——`Error: fixture Workspace new-session action missing`（command-image-envelope / image-display）、built-boot 找不到文本 `fixture`；(b) 录制夹具级——`llm-replay fixture not fully consumed`、preset-migration 的会话目录 ENOENT、`[data-sample="bash"]` 超时（bash-abort-row / minimal-preset）；(c) golden 落后于历史产品改动（clickable-links-gallery 的 `16 tool calls` 与真实分组区不一致等）。**这批不是 Step A 造成，也不是 Step A 能安全顺手修的**——修它们要动组装夹具/录制夹具，属独立波次。

**本步验证阶梯（都在最终树上跑）**：`pnpm run build` 通过（282 client artifacts）；双面 `tsc -b`（client 由 build 覆盖、host 单独 `tsc -b tsconfig.host.json`）零错误；`npx vitest run packages/client/ui-chat` 464 passed；`pnpm run test:docs` **20/20**；`pnpm run test:gui` 7822 passed / 1 failed / 1 skipped——唯一失败是既有的 `packages/client/ui-approval`（单跑该文件 15/15 通过，D6 波次已在干净树上复现过同一失败，属间歇既有红）；改动路径 `run-oxlint` 0 warning 0 error。

**残留红（本步之外，均有测量证据）**：`verify-client-domain-graph`（`ui-sidebar-documentpreview` 的 text⇄document 兄弟域互引，29 处匹配，HEAD 原状同样红）；`run-oxlint` 对 `packages/client/ui-chat/tests/chat-view.client.spec.tsx:303` 报 `typescript(no-unnecessary-type-parameters)`（该行在 HEAD 逐字存在，pre-commit 钩子不含该规则，故从未拦住）；`test:gui` 的 `ui-approval` 间歇红。

### Step B 落地记录：图标 aria-hidden 对齐 + golden 去噪（2026-09-26）

**改动范围**：packages/client/ui-primitives/src/icons/index.tsx 的 **87 个 `<svg>` 全部补 `aria-hidden="true"`**（原本只有 6 个）→ 81 处新增；diff 纯净（162 条变更行全部是 `<svg>` 开标签行），模块仍导出 89 个符号。

**关键判断：不移植上游图标**。QiLin 的图标集是自有 `ic_ds_*` 一套（上游是 artwork + strokeWidth 的另一套，命名与结构都不同）。整体对齐等于把 dsh 图标换进麒麟——违反品牌红线，故本步只补可访问性属性、不换图形。同理未带入 kcoder 专属补丁。

**归属**：全量 replay 后新增 **57 个失败文件**（与既有 27 个红 **零交集**）；其中 86 条是 golden、32 条是同文件内 golden 失败导致清理未完成而引发的级联（菜单/模态残留 → 后续用例超时）。

**刷新与不变量校验**：57 spec → **137 个 golden 文件**（−3664/+1349）。校验脚本对全部变更行归口：
- removed 3664 = **1613 条裸 `- img`** + 702 条子文本行（父行折叠时被吸收）+ 1200 条父行折叠（去掉冒号）+ 143 条父行内联文本 + 6 条 diff 对齐重发；**未解释 0，其中交互元素 0**。
- added 1349 = 1200 条折叠父行 + 143 条内联 + 6 条重发。
即：没有任何交互元素、可访问名或标签被改动，唯一变化是图标离开可访问性树。
另有 4 个 jsdom 快照（`packages/client/ui-sidebar/tests/__snapshots__`）更新，diff 仅 10 行 `aria-hidden="true"` 属性（该快照序列化 DOM 标记）。

**残留（Step B2 候选）**：仍有 **460 条裸 `- img` / 32 个文件**，来源是图标集之外的 svg：FishLogo / CodeFileIcon / SiteGlyph / LinkIcon / FileTypeIcon / ReferenceIcon / StateDot / JsonTree、ui-brand/Seal、ui-deliverables/icons、ui-conversation 内联 svg 等。其中含品牌图形，需逐文件确认语义（装饰 vs 有含义）后再决定，**不批量刷**。

**验证**：ui-primitives 单元 992 passed；`test:docs` 20/20；图标文件 oxlint 干净；`test:gui` 1 failed / 7822 passed（唯一失败是既有 ui-trajectory）；全量 replay 泳道 **27 文件红——失败文件集合与基线 `identical: True`**，用例 40（基线 38）。

**解释那 +2（重要，避免被误读成 Step B 回归）**：`agent-preset-authoring` 是既有红文件。它的「copies 极简模式」用例第一个失败点因该 golden 同样含图标噪声而从 **147 前移到 125**（复制对话框尚未关闭就 abort）→ 残留模态挡住后面两个用例（行 165 / 243 超时）。改动前后的失败**文件**集合一致，故不是新红；该文件属既有红波次，**不做盲刷**（它的根因是更早波次的设置入口迁移遗留，与图标无关）。

### 既有红根因波（2026-09-26）：27 文件 → 0

**方法**：把 Step A/B 后的 27 个既有红逐条取错误详情并按根因分组，只修「真根因」，golden 类先跑 replay 拿到精确失败集再定向 refresh（未定性/仍红的文件一律不刷）；每批定向 replay 验证，最后全量泳道收口。

| 组 | 文件 | 根因 | 处置 |
|---|---|---|---|
| 组装态夹具与桩 | built-boot、command-image-envelope、home-path-tilde、image-display、max-tokens-notice、search-card、todo-row、trajectory-image-display、submission-echo | ① fixture 的 workspace baseline 缺 `pinnedSessionIds` → `replaceBaseline` 抛错半途中断，界面静默降级成「Ungrouped」；② RemoteMock 缺 `session/projections`、`job/list` 两个通道；③ jsdom 无 `document.fonts`，`observeControlRow` 直接解引用导致 InputBar 整块不渲染 | 补夹具字段、两个 mock 通道、`document.fonts` 桩（提交 subject：`fix+test(web): 组装态夹具补 pinned/projections/job-list 并补 document.fonts 桩`） |
| 过程分组可见性 | bash-abort-row、minimal-preset、workflow-run、clickable-links-gallery | C2 把过程行放进默认折叠的组 seat，旧断言/定位前提失效 | 先 `expandTurnProcesses` 再断言；workflow-run 的 `/^Run/` 与 run 行撞名，改按 `[data-workflow-run] [data-disclosure-row]` 取 phase 行 |
| 探针量错元素 | window-drag-coverage | 拖拽标记在**外层常驻 header**，探针取的是内层 session header（批次三新增 leading 席位后两者高度不同） | 改用 `header[data-window-drag]` 矩形 |
| golden 落后 | 33 个 golden 文件（agent-preset-authoring、background-job-list、github-ready-review、goal-multi-turn-actions、markdown-\*、math-rendering、queue-\*、streaming-fence-highlight、voice-input、workflow-run…） | 基线都拍在 C2 过程行 / 批次三头部改版 / Step A 状态-时长标题 / Step B 图标去噪落地之前 | 定向 refresh，差异逐类可解释（新增过程行与 status、移除已删的头标签页、图标离开可访问性树） |
| 代际硬编码 | preset-migration | spec 把 successor 名与 `version` 硬编码成 v3（当前代已是 v4） | 改为由 `SESSION_FORMAT_VERSION` 派生 |

**两个值得回馈上游的真问题**：① `document.fonts` 在无 CSS Font Loading 的环境（jsdom、部分 WebView）会让 composer 整块崩——上游同源代码；本仓在测试环境补桩（生产代码保持与上游一致）；② `replaceBaseline` 遇到缺字段会**半途中断并静默降级**，建议组装态夹具加载对必填字段 fail loud（下一步可做）。

**结果**：全量 replay 泳道 **0 failed / 127 passed / 1 skipped**（文件）、**0 failed / 448 passed / 15 skipped**（用例），耗时约 11 分钟。

### Step B2 落地记录（2026-09-26）：裸 `- img` 清零

残留测量（本步开始时 460 条 / 32 文件）→ **0 条 / 0 文件**。结论与证据：460 条里
458 条其实是波① golden 收敛时顺带清掉的陈旧基线，真正剩下的只有文档预览里
`Line wrap` 按钮内的两个自有图元（IconNowrapFill16 / IconWrapFill16）——已补
`aria-hidden="true"`（提交 subject：`fix+test(web): 文档预览换行图元补 aria-hidden，最后 2 条裸 - img 清零`）。逐文件与上游 rc.2 比对后**不动**：
`code-file-icon-artwork.ts`（15 个 svg）与 `DropOverlay.tsx`（2 个）上游同样没有
aria-hidden；`ui-trajectory` 的轨迹画布是 `role="img" + aria-label`，属有意保留的
可访问名。

### ③ 的决策简报（C1 文档预览族 / O Office 随包 runtime）

**已核实的最新缺口（不是旧审计的转抄）**：

| 项 | 现状 | 上游 rc.2 |
|---|---|---|
| `packages/skill/tool-workspace-dependencies` | **整包缺失** | 有 |
| `skill-office` 挂载 | 包在树里，**7 个 bundle 全 0 引用** | sdk-app 挂载（`id: skill-office`） |
| sdk-app bundle 行 | 缺 `workspace-dependencies` + `skill-office` 两行 | 有（第 30/36 行） |
| `client/ui-sidebar-documentpreview` | 118 文件 | 185 文件（+67） |
| C1 依赖补丁（fortune-sheet ×2、exceljs） | **不存在**（patches/ 仅 pi-ai / pkg / node-pty） | 有 |
| DOMPurify / exceljs / fortune-sheet 依赖 | 全仓无引用 | 有 |

**需要你拍板的两件事**：

1. **C1（文档预览族）**：是否引入 xlsx 预览栈（fortune-sheet ×2 + exceljs，各自带 vendored 补丁）与静态 HTML 预览（DOMPurify）？代价：3 个依赖补丁 + 67 文件子树 + 安全面（DOMPurify 解析不可信 HTML）+ 包体增大。**建议**：先做无依赖的三项（缩放、本地图片、资源变更刷新、工具栏插件位），把「表格原生渲染 / 静态 HTML」单列一批，等你确认依赖口径再动。
2. **O（Office 随包 runtime）**：QiLin 是否要随包带 Office 能力？最小对齐 = 移植 `tool-workspace-dependencies` 新包 + sdk-app 补两行 + `python/sdk-runtime` 资源面。**建议**：做（属上游默认随包能力，且 `skill-office` 现在是「在树里但没人挂」的半成品状态，比缺包更糟——门禁与文档都看不出它没接）。

拍板后我按「先无依赖项、后依赖项」的顺序继续。

### ③ 的三条口径已拍板（2026-09-26）与其落地顺序

用户答复：**① 补 zoom 的 e2e 覆盖面；② C1 依赖口径照做（即引入 fortune-sheet ×2 + exceljs + DOMPurify 等，把表格预览与静态 HTML 预览一并完成）；③ O 随包带 Office。**

落地顺序（同工作树，**串行**执行，避免两个 writer 冲突）：

| 序 | 波次 | 范围 | 依赖 | 状态 |
|---|---|---|---|---|
| 1 | C1 缩放 | `src/client/zoom/*` + image/pdf/office 接入 | 无 | **已完成**（提交 subject：`feat(client): 文档预览移植上游缩放能力（zoom 视口与浮动控件）`） |
| 2 | C1 本地图片 | `markdown/path-images.ts` + MarkdownBody | 无 | **已完成**（`feat(client): 文档预览移植上游 Markdown 本地图片解析`） |
| 3 | C1 资源刷新 | `document/resource-group.ts` + store/contract/face/TextPreview/HtmlBody/OfficeBody 整链 | 无 | **已完成**（`feat(client): 文档预览移植上游资源变更刷新（ResourceGroup 与自动刷新）`） |
| 4 | C1 席位 | `document.{actions,unpreviewable,action}` 三席位 + ui-open-in-app occupant | 无 | 进行中 |
| 5 | zoom e2e | 上游同提交的四个场景（底部揭示/隐藏、预设切换、图片 200%、Office 捏合 166%），需新增 golden 行并 refresh | 无 | 待办（已拍板要做） |
| 6 | C1 表格预览 | `src/client/excel/**`（16 文件）+ 13 个 xlsx 夹具 + fortune-sheet ×2 / exceljs 三个 vendored 补丁 + licenses + README | **重** | 已拍板 |
| 7 | C1 静态 HTML | `html/basic-document.ts`、BasicHtmlFrame、interactivePreview、frameName、DOMPurify | **重** | 已拍板 |
| 8 | O Office | `skill/tool-workspace-dependencies` 新包 + sdk-app 两行（`workspace-dependencies`/`skill-office`）+ `python/sdk-runtime` 资源面 | 中 | 已拍板 |

**执行纪律（沿用本仓既有做法）**：每个波次先出**差分报告**再动手；只搬该能力增量、其它未对齐项只报告；每波跑包级 vitest + `tsc` + `test:docs` + 改动路径 oxlint；golden 不盲刷（只刷相关 spec 并逐条解释 diff）；探针不进 `apps/web/tests/`；不边跑 e2e 边 build；每波结束时由主会话跑一次**全量 replay 泳道**做认证。

### 8 波收口与本会话总账（2026-09-26）

**本轮 ③ 的 8 个波次全部落地**（每波都有差分报告与包级验证，主会话对 1-4、5、6+7 分别跑过全量 replay 泳道认证）：

| 波 | 内容 | 依赖变化 | 认证 |
|---|---|---|---|
| 1 | 缩放（zoom 视口 + 浮动控件 + PDF 缩放后重绘） | 无 | 全量泳道 0 failed |
| 2 | Markdown 本地图片（path-images） | 无 | 含在 1-4 合并认证 |
| 3 | 资源变更刷新（ResourceGroup + autoRefresh 整链） | 无 | 含在 1-4 合并认证 |
| 4 | 文档头部三席位（actions / unpreviewable / action）+ ui-open-in-app 打开入口 | 无 | 含在 1-4 合并认证 |
| 5 | zoom 的 e2e 覆盖面（揭示/隐藏、预设切换、图片 200%、Office 捏合 166%/400%、DPR 重绘断言） | 无（只动测试面 + 2 个 golden 定向刷新） | 全量泳道 0 failed |
| 6 | Excel 表格预览整族 | 重：fortune-sheet ×2 / exceljs 三个补丁 + exceljs/fast-xml-parser/fflate/papaparse/xlsx 依赖 + lockfile | 6+7 合并认证 0 failed |
| 7 | 静态 HTML 预览（DOMPurify 清理 + CSP） | dompurify ^3.4.11 | 1-7 合并认证 0 failed |
| 8 | Office 随包（tool-workspace-dependencies 新包 + sdk-app 两行 + python deploy closure） | 两条 workspace 依赖 | 终认证见下 |

**必须记下的两个边界判定（主会话裁决后执行）**

1. Office 的启用 gate 翻译：上游 sdk-app 的两行用 DSH_PRIMARY_RUNTIME / DSH_BUNDLED_PRIMARY_RUNTIME（桌面 primary runtime）做 !!js 条件启停，而本仓明确不采桌面壳与 scripts/primary-runtime。判定：env 改名为 QILIN_PRIMARY_RUNTIME / QILIN_BUNDLED_PRIMARY_RUNTIME，保持「没有 runtime 就不启用」的语义；不改 runtime-bootstrap.mjs，因此默认两行保持 disabled（不会去读不存在的 payload）。激活方式（env、payload 目录结构、office-skills 从 packages/skill/skill-office/assets/ 复制）写进 sdk-app patch 注释与新包 README 的 Carrier activation 一节。没有凭空造 runtime，也没有无条件启用。
2. python 资源校验面（_resources.py、hatch_build 的 runpy 校验、__init__ 的 validate_resources、runtime-bootstrap 载体默认）：它们校验 scripts/primary-runtime 的产出，而本仓的 build-exe-for-python-sdk.ts 早已删除 preparePrimaryRuntime 调用、也没有该目录。照搬会让 wheel 构建直接失败，故只补 exe deploy closure 两行，并在 README 声明「payload 始终由部署方提供」。

**遗留与建议（按优先级）**

1. libreoffice-kit ^0.1.0 -> ^0.1.1 跨包 chore（牵 web-app、office-to-pdf、minimumReleaseAgeExclude、lockfile；只改 skill-office 会同时装两份）——建议单独一波。
2. tests/fuzz/（Excel 模糊测试 harness）不采：generate.py 需 Openpyxl/XlsxWriter/Pillow 且由桌面 primary runtime 驱动；README 死链已改写，本仓现只有 14 个已提交夹具的回归。
3. 既有门禁红（均已在 HEAD 或干净 worktree 复现，非本会话引入）：verify-cordis-config（唯一报错：packages/bundle/web-app/cordis.patch.yml 的 @qilin/tool-kylin/host 缺 tsconfig.base.json 源面映射——主会话已独立复核：本会话对该文件的改动只有新增 @qilin/tool-workspace-dependencies 一行）、verify-runtime-closure、verify-npm-install-layout、verify-client-domain-graph、packages/client/ui-chat/tests/chat-view.client.spec.tsx 的 pre-existing oxlint、test:gui 的 ui-trajectory tooltip 与 ui-approval invariant 噪声。
4. 漂移类残留：cordis-tool-round / schedule-catalog 的 pin「陈旧但无人断言」；complex-history.perf 的 v4 合成日志失败（opt-in、非 CI）。
5. 待决策的小项：双 live region（ChatView 可见状态行 + 控件 visually-hidden 宣布）是否合并；chevron 取 label-caption 还是 QiLin 原 label-tertiary；面包屑 disabled button vs 上游 span；可选 bundle 本地化 BUILTIN_COPY vs pkg.meta 的结构性分歧；boot-patch 在 jsonl 行改名后静默跳过。

**本会话的方法学沉淀（写给后续）**：① 每一波都先做「改动前基线 vs 改动后」的对照，净新增失败必须为 0 才算完成；② golden 刷新先取精确失败集、只刷相关 spec、逐条解释 diff，禁止整片 refresh；③ 偶发竞态必须造出真实触发事件才谈复现；④ 同树并发（agent 写文件 vs 泳道运行）会产生假红（hmr-live 已实测证实一次），串行是纪律不是建议；⑤ 生成物门禁（client slot catalog、third-party notices、docs catalogs、tsconfig paths、lockfile integrity）要跟着源改动一起结清，否则会在 doc-sync/CI 处积欠。
