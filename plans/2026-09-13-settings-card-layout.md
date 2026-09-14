# 设置页卡片化布局

## Goal
将设置页详情重排为居中的卡片布局，增加返回工作区入口、底部 About 页面和带「麒」「麟」双字标识的项目介绍，同时保持现有设置生命周期与 slot 组合方式。

## Task List
- [x] 扩展 settings mark owner props 与 `settings.about.mark`、`settings.summary.mark` 根作用域单值 slots；让 QiLin brand provider 通过独立声明链注册双字印章。
- [x] 注册 shell-owned About section，补齐中英文 locale 文案、双字 fallback、底部导航入口和项目介绍卡片。
- [x] 将活动设置详情包入居中主卡片；About 仅通过底部菜单进入，右侧摘要卡已按用户要求整体移除。
- [x] 增加返回工作区 capsule，复用既有 `onClose` 关闭生命周期，并保持 Escape、遮罩、关闭按钮、导航调整、连接恢复和 onboarding 行为。
- [x] 更新 client slot catalog、config catalog、包 README、设计 spec、Agent Note 双语 pair 与交叉链接。
- [x] 通过聚焦 Vitest、完整 GUI lane、类型检查、依赖/i18n/文档链接与预算检查、client/config catalog 检查、Markdown whitespace 检查。
- [x] 通过已构建 dist 的 Web smoke/sidebar 浏览器子集：19 项通过，8 项跳过真实 API 场景。
- [x] 收集完整 `QILIN_SNAPSHOT=replay pnpm run test:web` 后台任务结果并记录其失败或通过项；全量结果为 83 个测试文件通过、17 个失败、1 个跳过，失败主要来自本机 sandbox 与其他既有 golden。
- [ ] 在带认证的既有 DSH GUI URL 上完成真实 Settings 视觉验收；当前 `http://127.0.0.1:58878` 返回 401。
- [x] 完成最终 diff/status/stat 审计、`git diff --check`，并清理视觉 companion 后台任务。

## Scope
- `packages/client/ui-settings/src/client/contract/slots.ts`
- `packages/client/ui-settings-general/src/client/{AboutSection,SettingsRoot,locales,shell-contract}.ts*`
- `packages/client/ui-brand/src/client/{index,Seal}.ts*` 与包 manifest/测试
- `packages/client/ui-settings-general/tests/*.spec.*`
- `packages/extensions/kylin-client-runner/src/client/slot-catalog.ts`、`docs/config-catalog*`
- 双语 package README、design spec、implemented Agent Notes 与 `plans/` 记录

## Findings
- 设置 shell 是 `sidebar.settings` 的 owner；功能详情继续通过 `settings.section` 投影，品牌跨包关系只能通过 slots 表达。
- `QilinSealArtist` 已经包含「麒」和「麟」两组向量路径；空席位 fallback 也固定为 `麒麟`，没有单字近似或版本占位符。
- 主卡片使用现有 `--dsw-*` tokens，单列居中；`max-width: 680px` 时导航转为横向、头部操作换行。
- About 是 shell-owned、固定在导航底部的真实详情页；右侧摘要卡已移除，`settings.summary.mark` slot 与品牌注册同步删除。
- 共享 client control primitives note 仍是有效决策，本次设置布局通过双向链接记录其本地布局例外。

## Progress Log
- 完成 slot contract、brand provider、About section、settings shell layout、typed locales、focused tests 与 CSS contract。
- 重新生成 client slot catalog 与 config catalog；补齐中文 config catalog 对侧并刷新 bilingual hashes。
- GUI lane：通过。聚焦 settings/brand/theme 测试：42 项通过；完整 GUI 覆盖也通过。
- 构建后 Web smoke/sidebar：2 个测试文件通过，19 项通过，8 项跳过；刷新并 replay `settings-chrome` ARIA goldens 后 11 项全通过。
- 文档 lifecycle：803 个 bilingual pairs、1598 个 Markdown links、8 个预算文档、330 个 Agent Notes 全部通过；client UI i18n、package dependency、README summary、export JSDoc、Markdown wrap 均通过。
- 完成 current-state Agent Note 改写与 shared-control note 双向交叉链接；未发现需要归档的旧 settings-card note。
- 按用户反馈整体移除右侧「关于 QiLin」摘要卡：slot、品牌注册、样式、locale 键、测试与 ARIA goldens 同步清理；client catalog 已重新生成。

## Errors
- translation pairing 首次发现 config catalog 英文生成内容新增 `@qilin/client-ui-account`；已同步中文对侧并重新记录 pair，当前检查通过。
- `doc-typecheck` 仍被仓库中既有 Agent Notes 对外部 `@deepseek-ai/dsh-*` 模块的声明缺失阻塞；本次新增文档未出现在错误中。
- `verify-cordis-catalog` 仍报告既有 `ctx.settingsShell` rendering projection partition violation；本次 diff 未改变该 service declaration。
- `verify-client-domain-graph` 仍报告既有 ui-conversation/ui-sidebar-documentpreview sibling-domain violations；本次变更文件未涉及这些路径。
- 完整 lint 仍报告既有 experimental webworker buffer-base64url unsafe diagnostics；没有 changed file 被命中。
- 既有 DSH GUI URL 未提供认证 launch token，直接访问返回 `401 Unauthorized`；未启动替代 server，也未暴露 token。
