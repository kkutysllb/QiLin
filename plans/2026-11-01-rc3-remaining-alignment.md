# 3.1.8-rc.3 剩余对齐清单（留给下一版本）

- 状态：rc.3 预览发布在途；本文只登记**下一版本**要收的对齐项与验收口径。
- 上游基线：`dsh-v0.2.2-alpha.2`（主对齐计划见 [2026-10-28-upstream-0.2.2-alpha.2-alignment.md](2026-10-28-upstream-0.2.2-alpha.2-alignment.md)）。

## 一、rc.3 已收口（不再重复）

- 会话语料：v4 → v5 全量重录（108 目录 / 125 个 v5），`test:snapshot` 从 113 红降到 0 红。
- 覆盖门：`ci-coverage`（分区 2）0 条 ERROR。
- 子代理：`stopped`/`awaitStopped` 生命周期；并发调用按接受序编号；结算通知在 turn 边界投递（确定且不增模型调用）。
- 插件管理页迁入设置分区；MCP 与技能设置页改为卡片样式。
- 桌面插件更新/卸载：`minimumReleaseAgeExclude` 归一化为裸包名；随包 pnpm 升到 11.23.0。

## 二、下一版本要收的对齐项

### A. 契约小包与客户端能力

| 项 | 现状 | 验收 |
| --- | --- | --- |
| `official-bundles` 契约包 | 未移植 | 包与消费者落地；`official-bundle-packages` 的 ON_DEMAND 名单与 UI 徽标同源 |
| `message-quotes` 客户端插件（R2b） | 未移植；此前在「本地引用渲染 vs 管线化」之间未决 | 先定语义再落包：引用高亮、跳转与复制行为有单测与 web e2e |
| 插件清单 tab（`settings.plugins.tab`） | 无宿主：移除「内置插件」设置入口后 inventory tab 不可达；ui-settings-plugins 的卡片仍被插件页使用 | 二选一：补回 tab 宿主并接 inventory，或删除 tab 账本与死代码（覆盖率门会要求） |

### B. R4 客户端打磨（D 簇）

- dockkit：中键关闭标签页。
- 代码高亮：会话内代码行的行级高亮。
- 侧栏对齐与窄屏回流：与上游最新间距/宽度档位一致。
- PWA 图标与 manifest 收尾。

验收：受影响包单测 + `QILIN_SNAPSHOT=replay pnpm run test:web` 的相关场景；视觉以真实 web scaffold 截图对照。

### C. R3b 共享动画/primitive

- `ui-workspace` 切到共享动画与 primitive（上一轮只完成模型拖拽排序共用预览）。
- 验收：ui-workspace + ui-primitives 单测；视觉无回退。

### D. 子代理结算通知的关闭期丢失

- 现状：父 turn 已结束、进程收尾时才到达的 parent-delivery 通知进入 next-turn 队列，本 run 不读取；`subagent-parallel` 的第二个子通知因此不再出现在录制里（行为确定、replay 稳定，但相对旧行为有信息丢失）。
- 需要：关闭期 flush / 等待 resident 背景子结算的产品设计（SDK server shutdown 与 headless runner 两处共用一套语义），并补单测与场景录制。

### E. 快照 lane 的构建前置

- 现状：快照子进程加载构建产物 `lib`；改产品后必须先 `pnpm run build`，否则新增 API 在 replay 子进程不可见（本轮已在 runner 加能力守卫兜底）。
- 需要：把 `build` 作为 `test:snapshot` 的显式前置（或 gate 依赖），避免"源码已改、lane 跑旧产物"的误判。

### F. Windows ACL 场景

- 现状：`windows-acl-skill` 的 harness workspace setup 已实现，macOS 上真实运行并通过；pnpm corpus 的 pending 名单只剩这一条，理由为「需要 Windows 环境验证 ACL 语义」。
- 需要：在 Windows 上复跑该场景并重录，随后删除 policy 的 `PENDING_V4_SCENARIOS` 条目。

### G. Web e2e 浏览器 lane 基线

- 现状：rc.2 时该 lane 长期红（15/25）；本轮修复了 settings-chrome、plugin 系列与若干时序 flake，但仍非全绿。
- 需要：逐条定性（期望漂移/产品缺陷/环境），修到可纳入发布门禁；不能修的明确标注跳过原因。

### H. 发布与打包配套

- macOS 签名：`codesign --timestamp` 需要把 `HTTP_PROXY/HTTPS_PROXY` 指向本地代理（`http://127.0.0.1:7890`），签名缓存先预热两轮；未签名包仅作对照。
- `pnpm` 随包版本：rc.3 已升到 11.23.0；下一版本继续跟随稳定线，升级时同步 `packageManager`、根 devDependency、`apps/desktop` 依赖与 `native/system` 的 pin。
- vendor 族：本轮只 bump `qilin` 族；vendor 若有变更，按 `release:vendor` 独立批次并先于 qilin 发布。

## 三、门禁命令（下一版本沿用）

```sh
pnpm run build
pnpm exec tsc -b tsconfig.host.json && pnpm exec tsc -b tsconfig.client.json
pnpm run test:docs
QILIN_SNAPSHOT=replay pnpm run test:snapshot
QILIN_COVERAGE_PARTITIONS=2 npm_execpath="$(command -v pnpm)" pnpm exec tsx scripts/run-gates.ts ci-coverage
```
