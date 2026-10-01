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
| **S1 预览与文件工作台** | ~~G2~~（非缺口移除）+ G3 视频 + G4 上传拖放 + G5 全局搜索 + G6 Mermaid（+软链/右键小项） | ~1.5 天 | G3 已落（提交 1cba11b816：media 路由+video body）；依赖搬运为主，风险低 |
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

- S1a 已提交：`1cba11b816`（宿主包 preview-media + 视频 body + G2 修正撤除）+ `a368875a37`（README 三件套/组表）
- 已知测试面遗留（登记）：jsdm 下 DockSurface 度量循环（seat 40 例 + document-seat 7 例；度量代码与上游 rc.2 逐行一致、真机正常——用户 3.0.7 已验同款座席）
- 剩余：G6 Mermaid → G4 上传/拖放 → G5 全局搜索 →（软链/右键小项）→ S2 Git 面板（含 GitHub）→ 发版 3.0.8
