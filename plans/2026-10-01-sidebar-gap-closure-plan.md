---
description: "coding-sidebar 1.0.36 与 QiLin 原生右侧栏的逐项差距核销、内置插件模式的实施分批与 3.0.8 发布范围建议。"
kind: "plan"
---

# 右侧栏功能补齐 — 差距核销与实施计划（内置插件模式）

- 日期：2026-10-01
- 方向（用户拍板）：不 vendor；上游已有的不动；把 coding-sidebar 1.0.36 中**上游没有的能力**作为 QiLin 内置右侧栏插件体系（ui-sidebar-* 包模式）的功能点补齐
- 前置：原生右侧栏已完成 0.2.0-rc.2 对齐（3.0.7）

## 1. 差距核销表（逐项，已核实代码）

### 原生已有 → 不动

| 能力 | 原生落点（核实） |
|---|---|
| 目录树/懒加载/文件页 | ui-sidebar-files（懒加载目录树、reload、open-in-app） |
| **代码编辑器+保存** | ui-sidebar-files `file-editor.ts`：完整 CodeMirror（行号/换行/语法/历史键/脏点/冲突横幅/保存）——比插件先例更完整，**不动** |
| Markdown 预览 GFM/代码高亮/**KaTeX**/本地图片 | ui-primitives MarkdownText + katex.tsx + path-images |
| Excel 预览 | documentpreview `excel/`（fortune-sheet，xlsx/xls/csv/tsv） |
| text/html/image/pdf/code 预览 | documentpreview 各 body ✓ |
| 持久终端 + 回滚页 | ui-sidebar-terminal + terminal 服务（scrollback pages） |
| agent 终端工具 | packages/terminal tool-terminal ✓ |
| 内嵌浏览器（沙箱 iframe） | ui-sidebar-browser ✓ |
| 轨迹图三列泳道+检查器 | ui-trajectory（340 行基础版） |
| 计划页/任务页（拓扑+后台任务） | ui-sidebar-plans / ui-sidebar-tasks ✓ |
| 分栏/浮动窗 | dockkit（rc.2）✓ |
| 插件声明式设置/多语言 | 原生插件体系 ✓ |

### 上游没有 → 需补齐（GAP 清单，按用户价值排序）

| # | 功能 | 插件实现（1.0.36 源） | 原生状态 | 实施落点 |
|---|---|---|---|---|
| G1 | **Git 面板**：变更/diff/历史/分支/暂存/提交/还原/上游距离/推送 + GitHub 操作 | GitView 1012 行 + GitBranchView 280 + GitHubView + host `git.ts` 830 + `github.ts` 331（shell git 命令驱动） | **完全没有** | 新内置插件包 `ui-sidebar-git`（+host 面） |
| G2 | ~~Office 预览补齐：docx/pptx~~ | — | **非缺口（10-01 修正）**：原生 office/ body 已覆盖 doc/docx/ppt/pptx（宿主 office-to-pdf 转换+版本化缓存+字体提示，默认组合接线）→ 按上游已有不动，移除 |
| G3 | **视频预览（16 格式 Range 流式）** | VideoView + host `media-range.ts`（HTTP Range 转发） | 无 | documentpreview 新增 `video/` body + host Range 路由 |
| G4 | **文件上传 + 拖放上传** | UploadOverlay + host 上传面 | client-file-upload 只接会话附件；files 页无上传 | ui-sidebar-files 增强（复用 file-upload 面或走 workspaceFiles） |
| G5 | **全局文件名搜索** | host `fs-search.ts` + 树内搜索框 | 无 | ui-sidebar-files 增强 + host 搜索面 |
| G6 | **Markdown Mermaid 图** | client-mermaid 全量构建（11.17.2 钉版） | KaTeX 有、Mermaid 无 | ui-primitives markdown 管线 + documentpreview markdown body |
| G7 | **轨迹图增强**：按真实时间间距回放、附件缩略/灯箱、记录搜索定位、最慢工具与 token 分桶统计 | TrajectoryGraph 1025 行 | 三泳道+检查器（340 行） | ui-trajectory 增强 |
| G8 | **智能体团队页**：名册 + 任务看板 | TeamView | tasks 页是拓扑+后台任务（形态不同） | ui-sidebar-tasks 增强或新页 |
| G9 | **任务管理图**：树形/紧凑/网格三排布 + 节点拖动 | WorkflowGraph | 无 | plans/tasks 页增强 |
| G10 | **sidechat**：侧栏内继续当前会话上下文（可存为新会话） | SideChatView + sidechat-routes | 无 | 新 tab 型内置插件 |

小项随批：文件软链标识、树右键操作（核销时未见原生痕迹，随 G4/G5 批顺带核实补齐）。

## 2. 实施模式

- 全部走 QiLin 内置插件体系：`packages/client/ui-sidebar-<x>`（Client 半）+ 需要时 `packages/<group>/<x>`（Host 半：git/media-range/fs-search 等走 shell/webServer 服务），bundle/web-app 组合行登记
- 源码从插件仓 1.0.36 移植：说明符重写表已有先例（`@deepseek-ai/dsh-*`→`@qilin/*`）；图标名按 QiLin 编号集映射或自持；槽位/服务按原生契约（turnTail=✓ 不涉及；新 tab 走 `sidebarRightTabs.register` 公开 API——B5-2c 移植后语义完好）
- 测试：插件仓自带 tests 随功能移植改写为 QiLin 包内规格；快照/金样按仓库政策补

## 3. 分批建议（每批独立可验证）

| 批 | 内容 | 估量 | 说明 |
|---|---|---|---|
| **S1 预览与文件工作台** | ~~G2~~（非缺口移除）+ G3 视频 + G4 上传拖放 + G5 全局搜索 + G6 Mermaid（+软链/右键小项） | ~1.5 天 | G3 已落（提交 ：media 路由+video body）；依赖搬运为主，风险低 |
| **S2 Git 面板** | G1 全块 | ~2-3 天 | 最大单块；host shell-git 驱动 + 2200 行 UI；独立新包不扰现有面 |
| **S3 图与团队** | G7 轨迹增强 + G8 团队页 + G9 任务管理图 | ~1.5-2 天 | 增强现有包 |
| **S4 sidechat** | G10 | ~0.5-1 天 | 依赖会话续写语义，独立 tab |
| 发版 | version:set → 全量验证 → tag/Release/push | ~0.5 天 | |

全量 ≈ 7-9 天。**3.0.8 范围建议**：S1+S2（文件工作台/预览/Git 面板——「完善右侧栏」最实感的一批），S3/S4 顺延 3.0.9；或按你指定范围裁剪。

## 4. 待确认

1. 3.0.8 装哪些批（建议 S1+S2）？
2. G8 团队页：并入 ui-sidebar-tasks 还是独立新页（建议独立新页 `ui-sidebar-team`，tasks 页保留拓扑形态）？
3. G1 GitHub 操作（PR/issue 面）是否纳入首批（建议纳入，随 Git 面板一体）？


## 批次执行状态（2026-10-01 18:10）

- S1a 已提交：（宿主包 preview-media + 视频 body + G2 修正撤除）+ （README 三件套/组表）
- 已知测试面遗留（登记）：jsdm 下 DockSurface 度量循环（seat 40 例 + document-seat 7 例；度量代码与上游 rc.2 逐行一致、真机正常——用户 3.0.7 已验同款座席）
- 剩余：G6 Mermaid → G4 上传/拖放 → G5 全局搜索 →（软链/右键小项）→ S2 Git 面板（含 GitHub）→ 发版 3.0.8

- S1b 已提交：（Mermaid 一等围栏渲染：懒加载+严格安全+净化器+缩放模态；regex 空分支 bug 修正）


## 批次执行状态补充二（2026-10-01 18:45）

- S1a 已提交（视频预览+media 路由；G2 修正非缺口）
- S1b 已提交（Mermaid 一等围栏渲染；regex 空分支修正）
- **G4 架构前提发现**：fs 抽象服务仅有 `writeText`（UTF-8）；二进制上传需跨全部后端（local/sandbox/remote）新增 `writeBytes` 原语——这是架构级变更，需专项批（影响 fs/fs-local/fs-sandbox/fs-remote + 测试）
- **G5 搜索前提**：需 host 侧递归文件名扫描（插件 `fs-search.ts` 走 node:fs 直接扫描；QiLin 需走抽象 fs 或新增 fs 原语）
- 下轮执行：①fs writeBytes 原语批（G4 前提）→ ②G4 上传/拖放（preview-media POST 路由+files 页 drop 覆盖层）→ ③G5 搜索 → ④S1e 软链/右键 → ⑤S2 Git 面板 → ⑥发版 3.0.8

## 批次执行状态补充三（2026-10-01 20:30）

- S1a 已提交（视频预览+media 路由）；S1b 已提交（Mermaid）；S1c 前置两提交已落（fs writeBytes）；S1c 已提交（上传拖放）
- **S1d G5 全局文件名搜索已落地**：
  - host：workspace-files 新增 `searchNames` Remote——广度优先、只匹配普通文件、不区分大小写 basename 子串；Config 新增 `maxSearchMatches`(100)/`maxSearchVisited`(100k)/`searchExcludedDirectories`（默认 .git/node_modules 等噪声目录既不匹配也不进入；与 file-reference-local 的 @ 提及索引互不共用——那次是本地 fs 的排序候选，这次是会话工作区的 Remote 语义）；根外符号链接目录不进入（防泄露防成环）；命中匹配/访问任一上限即 truncated
  - client：ui-sidebar-files 新增 FileSearch（ui-primitives Input + 搜索图标），标题行下搜索框 200ms 防抖、代次守卫（换字即弃旧答案）、结果占据正文、点击走树行同款会话作用域地址；query+答案入 store 桶随重挂载恢复；locales 双语 7 键
  - 附带修正：file-preview 的 scope 文案与 B5-2c 后实际语义不符（ISidebarRight 无 scope），按 3.0.7 已发行为准改 spec+文档；ui-primitives Input className 允许 undefined（exactOptionalPropertyTypes）
- 下一步：S1e（软链标识/树右键小项）→ S2 Git 面板 → 发版 3.0.8

## 批次执行状态补充四（2026-10-01 21:35）

- **S1e 已落地**：FsDirEntry 新增可选 `symlink` 标志（`readdir(withFileTypes)` 原生信息，零额外 stat；type 仍为解析目标类型）——fs/fs 类型、fs-local fsio+映射、ssh entriesSchema（strict 校验加可选字段）、workspace-files directoryEntry+wire 类型全链贯通；FileTree 文件/目录行带链接图标+tooltip（locale 键 entry.symlink）。行右键菜单（Menu portal+getAnchorRect 光标定位）：文件行=打开/复制相对路径/复制绝对路径，目录行=两复制（copyTextOf：根=`.`、根下剥前缀、根外原样；writeClipboard 宿主剪贴板）。已知预存失败清单更新：file-body preview 断言已随 B5-2c 语义修正；jsdom DockSurface 度量循环 47 例、expand-button 1 例、settings shell ledger 1 例均为预存（stash 往返验证）。
- S2 host 半（@qilin/api-workspace-git，git core 无 gh）：子代理进行中；client 半（ui-sidebar-git）待 host 落地后另行委派。

## 批次执行状态补充五（2026-10-01 22:10）

- **S1 批文档门禁全部收口**：type-equiv 双语块（FsDirEntry symlink 字段、FsWriteOutcome after 可空——zh 块曾因一行空行失去 byte-identical 派生地位整文件降级为 primary，修复后 463 块 1:1 对账通过）；gen-kylin-catalog.ts TYPE_LINK_EXEMPTIONS 补 WorkspaceFileNameSearch（与既有 workspace-files 家族同措辞）；计划文档里的本仓裸哈希引用全部去引用化（verify-repository-references 要求 release tag 或受维护链接）；preview-media README 补目录/Dev Note 并把 S1c 的 PUT /sidebar/media/upload 上传路由补进双语文档（此前遗漏）；README.i18n.yaml 记录漂移四处重录（workspace-git 新建、workspace-files、ui-sidebar-files、fs/fs、preview-media）。
- **S2 host 核心已落地（本批最大单元）**：@qilin/api-workspace-git——WorkspaceGit extends TypertRemoteService、命名空间 workspaceGit、13 个 @Remote 方法（isRepo/repoRoot/status/diff/stage/unstage/discard/commit/branches/checkout/createBranch/push/pull），全部经 node:child_process 固定 argv spawn（ctx.shell 是单串 shell、表达不了固定 argv，README 记录）；Config 六项（gitBin/timeoutMs=30s/discoveryTimeoutMs=5s/maxDiffBytes=1MiB/maxStderrChars/maxListEntries）；RemoteError 六码 workspace-git/{not-a-repo,too-large,bad-branch,bad-message,bad-path,command-failed}。关键修正两次：① 生成器拒绝返回类型里的 `T | undefined`（GitStatus branch/upstream 改可选属性）；② 可选参数在 signal 必须居尾的协议下不可表达——diff/stage/unstage 的 path 与 createBranch 的 from 改为空串语义（''=全树/HEAD），双语方法表同步。测试 6 文件 38 例（真实 git init 临时仓库）；子代理另驱动 WorkspaceTypertGenerator 实测严格生成双工件、workspaceFileScopeId 两工件均绑定。
- **S2 聚合接线**：api-remotes 客户端聚合挂载 workspaceGitRemote（import+类型出口+$mount 列表），包依赖入 package.json。
- **S2 进行中（双代理并行）**：gh 面并入 workspaceGit（ghAvailable/ghAuthStatus/ghListPrs/ghCreatePr/ghMergePr + ghBin/ghTimeoutMs Config + 解析器 fixture 单测）；ui-sidebar-git 客户端包 Phase 1（端口上游 GitView/GitBranchView 约 1.3k 行为内置插件包，参照 ui-sidebar-files 全套解剖：./client 出口+座位注册+face 缝+locales zh 源+逐文件 100% 覆盖），GitHub 节为 Phase 2 等 gh 类型落库。
- 发版 3.0.8 前置不变：QILIN_SNAPSHOT=replay test:web（G5/S1e 可见变更）+ doc-sync 全绿。

## 批次执行状态补充六（2026-10-01 23:40）

- **S2 全量落地**：gh 面并入 workspaceGit（18 个 Remote 方法：13 git + 5 gh；新码 bad-pr-title {field,length}，结构非法线上值直接 gateway/bad-request；ghListPrs 一次 --json 调用、畸形零退出输出降级空表；敌意标题注入测试钉死单一 argv 传递；宿主 8 文件 69 例全绿）；客户端 @qilin/client-ui-sidebar-git（7 文件 94 例、逐文件 100% 覆盖、bundle 77.6kB；面板=探测→头部(上游↑↓/push set-upstream 变体)→三段变更区+行菜单(暂存/弃置/复制)→内联 diff(暂存切换/逐行着色)→提交框(Ctrl+Enter)→分支区(检出/新建)→GitHub 节(认证门禁/筛选/PR 行/合并方式/新建 base 预填)）；ui-primitives 补 useCopyFeedback 出口。
- **关键接线修正三处**：① 生成器拒绝 Remote 返回类型 T|undefined 与可选参数（signal 必须居尾）→ 空串语义（''=全树/HEAD）+ 可选属性；② api-remotes 对 host-only 包只用空子句再导出（`export type *` 触发生成器 src 平面缺文件崩溃——settings-controller/office-to-pdf 先例）；③ 客户端工程引用 host 叶解析 types 到构建声明（documentpreview→office-to-pdf 先例）。
- **门禁收口**：tsconfig 手写别名两条、ME 审计句三条（workspace-git/preview-media/ui-sidebar-git）、preview-media 限制项实体化、JSDoc 补注两处、src 下 315 个陈旧构建残留删除、capability-seams zh 表/图手工同步（审校翻译对侧需手工补行）、README 配对漂移全部重录、Mermaid aria-label 走 MarkdownLabels.mermaid（七个消费方接线+locale 中央键）。doc-sync 43 门中 42 绿。
- **预存失败清单新增**：① verify-persistence-changes——v3.0.5 之前的提交带入的两份历史快照（2026-09-16-session-format-v4 全部根、2026-09-20-unknown-child-catalog）记录 digest 与现行 canonicalizer 不一致，属算法换代未迁移历史，需 persistence 属主专项裁决（不可简单重写历史 digest）；② trajectory views.client.spec「unloaded history prefix」tooltip 计时在整文件运行下偶发（隔离运行绿，stash 往返证实与 S1/S2 改动无关）。
- 进行中：QILIN_SNAPSHOT=replay test:web（G5/S1e/S2 可见变更验证）→ 全绿后发版 3.0.8。

## 批次执行状态补充七（2026-10-02 06:40）——web 闸门对拍定谳与 F0a 收口

- **web 闸门对拍方法**：v3.0.7 干净 worktree（/tmp/qilin-v307-web，install+build 全新）与本仓 HEAD 各跑同批 4 个失败 e2e（schedule-after/approval-composer/sidebar-right/seeded-history，QILIN_SNAPSHOT=replay，无沙箱）。结论：**v3.0.7 发布基线本机本就带 9 个同面红**（schedule×2、seeded×2、sidebar-right×5——与「B9 本机环境受限项」一脉相承；CI workflow 自 9-12 起停摆，test:web 权威在 Linux CI）；HEAD 11 红 = 9 预存 + 2 表面新增。初跑 70 红的完整 lane 是旧沙箱污染数据（日志内 `posix_openpt failed: Operation not permitted` 等铁证），不可作闸门依据。
- **2 个表面新增的分流**：① sidebar-right「starts collapsed…」——guide 入口 7→8（S2 Git changes 入口进 shipped 组合），属 S2 漏对位的 golden：已修 e2e 期望（count 8 + kinds 增 'git'），修后该用例转绿；② sidebar-right「opens content once, splits…」——chip 开文件后 Files 工作台 tab 偶发不落（v3.0.7 隔离重跑同报错 `['notes.txt']`，同代码同红），判预存 flaky（Start→内容替换路径的竞态），登记不修。修正后 4-spec 复跑待收数。
- **F0a 收口**：preview-media REAL-composition route.spec 4/4 绿（认证 fence 401/整文件与 Range/上传含越界 403 与超限 400/HMR 释放）；修复过程中的两处认知落点：① 认证 token 交换发生在 index 服务路径上，组合必须挂 host-frontend-static 才有 WEB_ENTRY 路由；② frontend-static 占 webserver fallback 席位，非 GET/HEAD 落到 fallback 是裸 405（命名路由消失后的 HMR 断言要点是「空响应体 405/404」）。fs-sandbox writeBytes 越权覆写 + preview-media 上传隔离/显式策略已验证，preview-media 全套 + document-preview 并发跑 14/14 绿。
- **F0b/F0c 推进**：mermaid.client.spec 补成功渲染 + 指针/键盘开缩放 + 遮罩关闭（vi.resetModules 隔离模块级 mermaid 缓存，4/4 绿）；fs-local filesystem.spec 补 writeBytes 描述块 9 例（全字节值往返/守卫四态/竞态对手/预中止/并发一胜一 stale，84/84 绿）。
- G7 轨迹图增强子代理已派发（ui-trajectory 回放/搜索/检查器/统计/缩放平移）；G9 任务管理图子代理已派发（ui-sidebar-tasks 三排布图/缩放平移/Alt 子树拖拽/store 工厂）；G8/G10 因都要动 api-remotes 生成面而串行在后。

## 批次执行状态补充八（2026-10-02 07:00）——G8 形态仲裁与预存清单增补

- **G8 团队页形态仲裁**：落 `packages/experimental/client-ui-agent-team`（看板页 + 写入桥 remote→agent-team 服务，经既有 mount-experimental-entry 组合 patch 挂载），不建 release 级新包。依据：① `default-product-isolation.e2e` 钉死默认产品零 experimental 引用，experimental 走显式 patch 参与组合，本来就是受支持的分发形态；② release→experimental 依赖禁令使「新正式包 ui-sidebar-team」不可行——其数据面（agent-team 服务/journal/projection）仍在 experimental，除非先做服务转正（超出 3.0.8 范围，登记为后续独立工作）。上游 1.0.36 团队页对齐 = 功能可用且默认不挂载。
- **预存失败清单增补**：sidebar-right「opens content once, splits…」chip 开文件后 Files 工作台 tab 偶发不落——v3.0.7 干净 worktree 同代码同报错复现（隔离跑必红、整 lane 跑偶绿），判 Start→内容替换路径的顺序敏感竞态；与 S1/S2 无关，登记不修。4-spec 复跑（无沙箱）后 HEAD 红集与 v3.0.7 基线完全一致（9 红，guide 7→8 欠账已修）。
- 清理完成：`.agents/tmp-release-notes-v3.0.6.md` 删除（3.0.6 已发，草稿过期）；stash `qilin-stepA-baseline` 落弃（2026-09-26 基线，内容已全部落地）；旧 worktree /tmp/qilin-307、/tmp/qilin-orig 移除；/tmp/qilin-v307-web 保留至发版前全量对拍后回收。

## 批次执行状态补充九（2026-10-02 07:05）——发版工件预置

- 发版说明骨架预置于 `.agents/tmp-release-notes-v3.0.8.md`（对齐 3.0.7 体例；G7-G10 终稿措辞待代理落地后补）；沿用临时文件模式，发版后删除。
- **提交批次计划**（代理全部落地并复核后执行）：① F0a 安全批（fs-sandbox src+tests、preview-media src+route.spec）② F0b/F0c 测试与文档批（mermaid spec、fs-local spec、FileTree ignore、UploadOverlay spec、两包 README×3 件）③ web 闸门批（sidebar-right.e2e 7→8）④ G7 轨迹图批 ⑤ G9 任务图批 ⑥ G8 团队看板批（experimental+api 桥）⑦ G10 sidechat 批 ⑧ workspace-git 覆盖批 ⑨ 计划文档+发版说明。每批独立可回滚、信息可重构。
- **G10 派发预案**（G8 settle 后即发）：范围=宿主 api-session-controller 增 sidechat* 方法（种子=父会话完整事件日志截至点击时刻、经 `SessionManager.fork`+`buildForkSeed` 现成链路、open-cut 合成 closers；五路由语义对上游 sidechat.start/快照/增量/释放/线程清单）+ 新包 `packages/client/client-ui-sidechat`（SideChatView 对上游 src/client/SideChatView.tsx，轮询退避、线程生命周期归 tab）+ sessions.fork 升级链路。约束：模型可见⟺日志可重构（种子即日志，无新模型可见输入）；typed locales；逐文件 100%；README 三件套；api-remotes 生成器纪律沿 S2 先例（signal 居尾、空子句再导出、结构非法线上值）。上游参照只读：dsh-coding-sidebar src/sidechat-core.ts(689)/sidechat-routes.ts(727)/SideChatView.tsx。

## 批次执行状态补充十（2026-10-02 07:30）——workspace-git 覆盖收官

- **F0b 最后一项关闭**：workspace-git 覆盖代理交付并经我复核（`pnpm vitest run packages/api/workspace-git/tests --coverage` → 89/89 全绿、workspace-git 零阈值违规）。src/index.ts 38 处未覆盖点全部以测试闭合（无一处 ignore）；parse.ts 12 处 = 11 测试 + 1 处唯一死臂 ignore（length<4 守卫使 slice(3) 恒非空）；src 仅 1 行注解、零行为变更。手法：stubGit 按子命令分派（out/err/code/sleepSeconds 驱动超时/静默臂）、真实裸仓驱动 push --set-upstream 与 ahead/behind、abort 两形态（Error 原因透传 / 字符串 reason 取消文案）、wire 缺字段 undefined-cast 防御臂走测试不走 ignore。

## 批次执行状态补充十一（2026-10-02 07:40）——G7 收官

- **G7 轨迹图增强交付并经我复核**（`pnpm vitest run packages/client/ui-trajectory` → 245/246，唯一红为预存 tooltip flake 与代理 stash 反证一致）。落地：逐 hop 回放（clamp 90–1100ms、×1/×2/×4、animateMotion 数据包、视口跟随）、搜索循环跳转（Enter/Shift+Enter/Escape + n/total）、边类型图例（aria-pressed 固定）、检查器（pretty JSON/MarkdownText 正文/授权灯箱附件）、slowestTools+token 分桶、指针锚定缩放 0.4–2.4+平移+fit；两新纯模块（canvas/inspector）零模块级状态；locales +30 键 zh 源 en 配对；README 双语+pairing 重录。自证：覆盖率 per-file 100% 零 ignore、test:docs 20 门、i18n 门、包级 tsc；其 test:gui 期间的 sibling 红（ui-sidebar-right/settings-general/documentpreview/theme）与 ui-sidebar-tasks 中间态红，待全部落地后终验复跑。G8 已确认在写 experimental/agent-team 远程桥（package.json/index.ts/tsconfig + 新 src/remote.ts）。

## 批次执行状态补充十二（2026-10-02 08:15）——G9 收官

- **G9 任务管理图交付并经我复核**（`pnpm vitest run packages/client/ui-sidebar-tasks` → 134/134 全绿、包级 tsc exit 0）。落地：纯模型（九种节点含 diagnostic、FOLD_MIN=6、done/standby 聚合）+ 纯布局（tree/compact/grid，贝塞尔边）+ declareStore 工厂（view/expanded/mode/offsets/camera，六动作相等写守卫）+ SVG 画布（光标缩放 0.2–2.5、CLICK_SLOP=4、fit≤1.25、ResizeObserver 自动重取景、默认子树拖拽/Alt 单卡沿上游实码）+ 页面集成（视图切换+按卡种路由）；八新 spec 文件，连带补齐 TasksBody/face/index/definition/rows/lineage 覆盖欠债至逐文件 100%；locales +24 graph.* 键；README 三件套含「图画 catalog 不画 run」Known Limitations。7 项上游差异成表（store 替代模块缓存、run 备而未喂、diagnostic 新增、列表为默认视图等）。test:gui 红项 A/B stash 反证均在本包之外；test:web replay 留终验链（需 dist 重建）。在飞仅剩 G8。

## 批次执行状态补充十三（2026-10-02 09:45）——G8 收官、G10 派发

- **G8 团队页交付并经我复核**（13 文件 174 用例全绿、双包 per-file 100%）。写入桥：agentTeams namespace `createTask`/`updateTask` wire face + `teamWireError` 三码映射（stale-revision/not-a-member/rejected+details.code）+ RemoteErrorDetailsMap 增强 + typert 导出面；看板页：Team 标签页（kind `agent-team` 单例、引导序 30）、创建/编辑表单（提交门禁+去重）、complete/reopen、两步删除、改派/释放、stale-revision 冲突提示+看板自动刷新、busy 锁定、切会话重置；`team-writes` edit 只发变更列表、依赖变更 set_dependencies rebased 写；mount 失败双回滚路径有测试。生成器三闸重跑（kylin-catalog/client-catalog/config-catalog）+ docs/subsystems/agent-team 文档更新；**隔离双证**：verify-default-product-isolation exit 0 + web 隔离 e2e 1/1 PASS（默认组合零实验包）。按仲裁 claim/release、拖拽、活动流延期（README 已记）。G7 新导出的 verify-export-jsdoc 红已由我补 JSDoc 修复（现全绿）。
- **两待终验复核项**（G8 上报的他方阻塞）：① apps/cli agent-team-headless e2e 超时——其 stash A/B 显示移除 G8 改动同挂，嫌疑落在共享脏树（含我 F0a fs-sandbox 改动）；终验链必须带 DEEPSEEK_API_KEY 复跑定位。② 全量 build 当时被 G9 WIP 挡死——现已落地，终验链复跑。
- **G10 已派发**（最后一个缺口）：session-controller sidechat 方法族 + 新包 client-ui-sidechat + 五路由语义对齐。

## 批次执行状态补充十四（2026-10-02 11:56）——G10 收官、终验链启动

- **G10 sidechat 交付并经我复核**（sidechat host spec + ui-sidechat 47/47 全绿、双注册面在位）。宿主：`src/sidechat.ts`（SessionSidechatController 六方法 start/prompt/cancel/snapshot/release/threads、`sidechatOwnEvents` 切片、48 码点标签截断、边界 prompt 逐字常量、RemoteErrorDetailsMap 三码、Config 可调预算 400 事件/10 万字符）；客户端：新包 `@qilin/client-ui-sidechat`（single 页签 kind `sidechat`、线程列表+转录+composer、follow 子代理地址 continuable、描述符 {version:3,provider:'sidechat'} 免前缀约定）；分层守规（model 纯折叠/source 作用域 observable 舱/face 唯一写入者/body 纯 props）；25 host + 22 client 用例。上游差异 6 项成表（模型对齐**先于投递**消除组装竞态、合成 fork closer+边界注入满足 model-visible⟺logged、助手流帧不绘 Known Limitations）。其顺手对齐 client-apply BASELINE 漂移（既有 assembly 默认值变化所致，待终验确认）。
- **终验链启动**（顺序）：① 全量 build（后羿中，产出新 web dist）② 全仓 typecheck ③ test:gui 红项清点 ④ 全量 test:coverage（CI 同口径）⑤ doc-sync 42 门 ⑥ 无沙箱全量 test:web replay vs v3.0.7 基线（9 预存红）对拍 ⑦ agent-team-headless e2e 带 key 复跑（G8 上报的脏树嫌疑，重点排我 F0a fs-sandbox 面）⑧ 九批提交 ⑨ 问用户 push。

## 批次执行状态补充十五（2026-10-02 12:20）——终验链推进

- **我亲手修复两代理测试类型债（27 处）后全量 build 与全仓 typecheck 双绿**：① G10 session-controller sidechat.host.spec 34 错（ConstructorParameters 别名、Pick<Session,'append'>、SessionSeq()/MessageId/SessionRequestId 品牌、corrupt descriptor 走 `as never` house pattern、移除 header 幽灵字段 inheritedEventCount——runtime 本就从 session/end-seed 标记推导）；② G9+G10 客户端测试 21 错（tab 合同 title(address) 一参/label? 可选收窄、SubagentCatalogEntry continuable 必须 label、RemoteError 三参构造器替代 Object.assign、ok() 泛型真值拓宽加 as const、SessionWireHeader.isSeeded、助手流 start 帧字段对齐、重复键合并/未用导入清理）。受影响 17 文件 181 用例复跑全绿。
- **环境事实**：本机无 DEEPSEEK_API_KEY——headless e2e 自跳过无法复现 G8 上报的挂起，按「owner 后续跟进」登记不阻塞本机链。
- **进行中**：test:coverage（bash-1623）、test:gui（bash-1624）、doc-sync（bash-1625）、hygiene（bash-1626）四门并行；之后全量 test:web replay 对拍 v3.0.7。










## 批次执行状态补充十六（2026-10-02 13:30）——终验链对拍定谳

- **test:coverage 复跑定谳**：26 文件红（自 33 收敛，我修 7：inspector 单跑 10/10、assembly-bundle-roster（ui-sidebar-git inject 悬空边——type-only 导入擦除，删 `@qilin/api-workspace-git` 边后 8/8）、persistence-epoch/persistence-schema/migrate-v4/verify-package-dependencies（stale 生成物，重生成即愈 111/111+42/42）、gen-tsconfig-paths（client-ui-sidechat 手写别名两条，仿 ui-sidebar-terminal 模式））。**26 个失败全部对 /tmp/qilin-v307-web 基线同命令复跑同红**（分四批对拍：环境重包 6+11+2、scripts/sdk/families/lint-fingerprint 3、settings-general/shell 1）——预存/环境性，零新增回归，零覆盖率阈值违规。1719 文件过。
- **doc-sync 41/42**：唯一红 verify-persistence-changes（persistence 类型历史 owner 门，G8 已定性预存）。修复过程中：sidechat-source.ts 补 6 处 @param、preview-media README Runtime invariant 句迁至文件尾（ME 段 KV Cache 后仅许一段）、pairing --write 重录、gen-plugin-packages 重生成、persistence-formats --write 刷新 3 文件。
- **hygiene 收敛中**：constraints（agent-team files 数组序 + preview-media 多 `lib/types/**/*.js`）已修；vendor rescope 快照残迹 3 处 **v307 基线同红=预存**；no-new-unknown-casts 31 处新增断言（本会话各工作流测试假对象 `as unknown as` 模式）交子代理按配方批修（typed vi.fn 泛型 / 单段断言 / Partial 中转，禁加基线条目），3 处已由我示范修毕（19/19 绿）；source artifacts（job-controller src/types.js* 泄漏）emitter 定位中——单包无 build script、双面 tsconfig outDir 均为 lib/types、全仓 tsconfig 无直接跨包 include，泄漏来自全量 build 某阶段，待复跑定位。

## 批次执行状态补充十七（2026-10-02 17:00）——终验链收口、唯一卡点留档、用户指示暂停

- **两子代理收官后我手修 7 处 slip**（trajectory spec user 节点 `source: null` 回补、team-body 424 泛形回补、PluginManagerPage 2 处、face.ts 2 处箭头体、tasks 箭头体、sidechat body.spec 括号），全仓 typecheck exit 0。casts 代理导出的 `pageRecords` 补 @param/@returns 后 verify-export-jsdoc 全绿。
- **source-artifacts 泄漏定谳**：build8 中途失败（我修 lint 时的两处类型错挡住 lib:client）留下的中间态使 build9 全链复现 src 残渣；build10（干净态）零复现——**瞬态，非持续 bug**。历史误提交的 `job-controller/src/types.d.ts.map`（随品牌面修复一并扫入）已删，随收尾批入库。
- **终验门终值**：build ✅ 406 artifacts；typecheck ✅；hygiene 17/18（唯一红 vendor rescope=基线预存）；doc-sync 41/42（唯一红 persistence owner 门=预存）；test:coverage **1719 过/26 红全预存/0 阈值违规**（与上轮逐文件一致，代理重构零覆盖损失）；no-unknown-casts 门绿（基线纯删）；oxlint NEW=0（168→103）。
- **test:web 全量 replay 首跑对拍**：HEAD 30 红/19 文件 vs 基线 36 红/24 文件——**HEAD 整体更绿**；基线红而 HEAD 绿 6 文件（feedback-release、subagent-interrupt-ui、sidebar-browser、queue-actions、goal-multi-turn-actions、background-job-list）；HEAD 唯一独有红 = default-product-isolation.e2e.ts。
- **default-product-isolation 挂起诊断链（已钉到最后一环前的半步）**：① 应用侧全净——服务器 60s 内 200、页面完整渲染、IPC roster 往返秒回、observer 插件激活正常；② vitest 外脚本全流程复刻（en-US + 拦截器 + goto + tree + roster）**全绿**；③ vitest 内相位探针：server-ready→goto 200→tree visible→client-roster 69→host-roster→mount-experimental→reload **全部通过**，挂在 reload 后 `expect.poll`；④ 机制：挂载后重载，`@qilin/experimental-client-ui-agent-team` 进 loadCache 但 fiber 停在 state 0，`ctx.loader.await()` 永不落定 → poll 内 `page.evaluate(readClientRoster)` 永不返回 → 180s 测试超时（420s 同挂，确定性）。⑤ 未钉死的半步： fiber 为何停在 state 0（嫌疑：该包 client apply 内 `mountAgentTeamUi` 等 typert 远程握手、或依赖的外部模块请求无供应商悬挂；G8 今晨同测 1/1 PASS，本会话改动与其无机制交集，**倾向环境/时序而非产品回归**；静态门 verify-default-product-isolation exit 0 独立证明隔离实质）。probe 探针文件已全部删除，/tmp 复刻世界已清理，工作树 apps/web/tests 仅剩本会话真实改动（sidebar-right guide 7→8）。
- **用户指示（17:00）：全部暂停，只汇报不发版。** 九批提交未动，push 未动，发版未动。恢复时从「default-product-isolation 最后一环诊断（probe5 全量非 ACTIVE 条目快照）」或直接按上节证据走九批提交两条路任选。

## 批次执行状态补充十八（2026-10-02 16:45）——default-product-isolation 定谳并修复（真实产品回归，非环境）

- **决定性证据**：一次性相位探针（probe6，只 dump 不 await，读 `ctx.loader.entries()` 全量 state + 浏览器 console，用毕即删）抓到唯一非 ACTIVE 条目与原因：`web boot: 1 entry did not activate / @qilin/experimental-client-ui-agent-team: pending (waiting for service: remote.agentTeams)`。首屏 69 条目全 ACTIVE，注入污染后重载变 70 条目、恰有这 1 条 PENDING。
- **机制定谳**：cordis `FiberState.PENDING(0)` 的语义是「等待注入服务」，`apply` 根本不会执行（vendor/cordis/src/fiber.ts:142）。而 `remote.agentTeams` 这个服务**正是该插件自己在 apply 里**用 `ctx.remote.$mount(contribution)` 创建的（mount.ts `mountAgentTeamUi`）——插件级 `inject` 声明了自己产出的服务，构成自锁：fiber 永远等不到自己的输出，`ctx.loader.await()` 永不落定，`readClientRoster` 卡死，poll 到 180s 超时。**补充十七的「倾向环境/时序而非产品回归」判断是错的**，这是 G7/G9 agent-team 客户端重写（TeamAction 弹层 → 完整 Team 页 + 写面）引入的真实自锁回归。
- **对照证据（同构正确实现）**：`packages/experimental/client-ui-voice-input/src/client/mount.ts` —— 插件级 `inject = ['remote', 'slots', 'locale', 'pluginNavigation']` **不含** `remote.speech`，自挂载的命名空间只出现在内层 `ctx.inject(['remote.speech', ...], registerUi)`。区别正是本次回归点。
- **修复**：`packages/experimental/client-ui-agent-team/src/client/mount.ts` 拆开两处声明——插件级 `inject` 去掉 `remote.agentTeams`（JSDoc 写明「本插件挂载它，写在这里会永远 PENDING」），新增模块私有 `UI_INJECT = [...inject, 'remote.agentTeams']` 供 `mountAgentTeamUi` 在 `$mount` 完成后的内层注册使用（此时服务已存在，等待立即满足）。同步更新 `tests/browser-plugin.client.spec.ts` 中固化了旧列表的断言并注明原因——该断言现在就是这条契约的回归守卫。
- **验证**：重建该包 client bundle 后 `default-product-isolation.e2e.ts` **1.6s PASS**（修复前 180s 确定性超时）；包内 8 文件 88/88 过；`pnpm run typecheck` exit 0；oxlint 103 条与基线一致（NEW=0）。probe6 已删除，工作树无探针残留。
