# Agent Note：coding-sidebar 以 vendor 内置为默认右侧栏，插件通道承担在线升级

Status: implemented

[English](2026-09-15-builtin-coding-sidebar-vendor-channel.md) | 中文

## Problem

web 面曾同时存在两个互不知晓的右侧界面：原生右侧栏（`qilin-web-app` 里的 `ui-sidebar-right` 与四个 tab 类型行）和外部维护的 `dsh-coding-sidebar` 工作台——后者面向 DSH 包命名空间（`@deepseek-ai/dsh-*`），经 DSH 插件通道安装。QiLin 改名了它导入的每一个 peer，`@qilin/*` 未上 npm，而仓库的逐文件覆盖率门也让「手工维护一份 packages/ 副本」不可负担——因此「依赖 npm 包」与「fork 进 packages/」都走不通。

## Decision

- **vendor 而非 fork。** `vendor/coding-sidebar` 是上游 `dsh-coding-sidebar` 仓的生成副本，由该仓 `scripts/sync-to-qilin.mjs` 产出（`--check` 校验零漂移）。机械重写（导入说明符改到 `@qilin/*`、身份字符串、为本仓打补丁的 `node-pty@1.2.0-beta.15` 放宽 `DSH_NODE_PTY_RANGE`、生成的 package.json/tsconfig/tsdown/cordis.patch.yml）按 vendoring 政策完整记录在 vendor/README.md 本地修改条目 10。
- **替换随插件自身的 bundle patch 走，不进 web-app patch。** 通道 patch 禁用四个原生标签类型行（`ui-sidebar-documentpreview`、`ui-sidebar-files`、`ui-sidebar-tasks`、`ui-sidebar-plans`）并插入一条带守卫的 `@qilin/coding-sidebar` 行；`ui-sidebar-right` 本体保留挂载——它拥有 `ui-chat` 与 `ui-trajectory` 硬注入的 `sidebarRight` 控制器和 `sidebarRightTabs` 注册表，而插件的 open-path 拦截把控制器的 `openResource` 门引进工作台。其上的 patch 层可以重新启用任一原生行，替换对每个部署可回退；升级后的插件版本也能自行调整替换集合而无需 QiLin 发版。
- **内置即 profile 模板种子。** `web` 与 `qilin` 的 `PROFILE_TEMPLATES` 追加 `@qilin/coding-sidebar`；`@qilin/web-app`（与 `apps/cli` 安装锚）依赖该包，安装闭包无需 profile `pnpm install` 即可解析。bundle 列表恰为前侧栏元组的存量 profile 归一化到当前模板（`INSTALLATION_OWNED_PROFILE_TUPLES`）；已被用户扩展过的 profile 保留自己的列表，改经 `qilin plugin` 添加。
- **在线升级是 profile-owned 覆盖，不是第二行。** `qilin-app-boot` 的 `PROFILE_OWNED_BUNDLES` 仅对 `@qilin/coding-sidebar` 反转双锚点顺序：经 `qilin plugin --profile web add @qilin/coding-sidebar@<spec>` 装进 `$QILIN_HOME/profiles/web` 的副本先于安装种子解析，唯一的模板条目挂载新副本，patch 行的 disabled 表达式在已有更早启用行挂载同名包（聚合包）时退让。通道包由插件仓以同名发布；在 `@qilin` npm scope 就位前，git spec 即可服务通道。源码启动（tsx）经 `tsconfig.base.json` 别名把该名字钉在 `vendor/coding-sidebar/src`，开发流始终演练 vendored 副本。
- **宿主无关的可选服务。** 上游 `dsh-coding-sidebar` 不再注入 client `workspaces` 服务（其遗留 `openPath` 门改为可选的 `ctx.get` 包装），并为无 `connection.api` 的载具守卫侧聊转录拉取，一份源码同时服务两个宿主；这些编辑先落上游再重新同步。

## Consequences

- `resolveBundleDir` 携带一个显式例外类（`PROFILE_OWNED_BUNDLES`）：其余内置组合包维持安装优先契约，清单成员由安装闭包做种子、让位于 profile 安装副本——正是「内置插件 + 独立发版线」的生命周期。
- web 组合保留 `ui-sidebar-right` 挂载（其控制器服务有硬依赖方），原生展开按钮与空面板仍可达；工作台经拦截而非控制器替换来持有标签面。设置页则由通道直接替换：插件以 `sidebar-right` 的节 id、priority -1 注册，外壳按胜出单元格投影导航行（[机制](2026-09-15-settings-nav-winner-projection.zh.md)）。
- `qilin plugin --profile web remove @qilin/coding-sidebar` 会一并移除依赖与 bundle 列表条目；恢复内置需把条目重新加回 `qilin.profile.bundles`（或重建 profile），因为一旦存在过 profile 副本，reconcile 就把该条目视作依赖托管。

## Alternatives considered

- 依赖 npm 已发布包：在 `@qilin` scope 发布前不可行，且在安装优先契约下升级仍会被 QiLin 发版卡住。
- 手工维护 `packages/` 移植：因逐文件覆盖率门与独立发版上游的同步成本而放弃。
- 直接禁用 `ui-sidebar-right`：`ui-chat` 与 `ui-trajectory` 硬注入其服务，启动即挂起，聊天面整体不可用，故放弃。
- 全面反转双锚点顺序：破坏内置组合包的安装优先契约；具名清单把变更限定在生命周期明确归 profile 所有的组合包。

## What was given up

- `packages/` 第一方移植：因逐文件覆盖率门与对高频发版上游（独立版本线 14 个版本）的同步成本而放弃。
- 保留原生右侧栏并动态避让（DSH 通道的共存行为）：QiLin 下工作台就是产品的右侧栏，disable-not-delete 让回退是一次 patch 操作而非运行时共舞。
- QiLin 上的侧聊转录分页暂缺，待插件把历史拉取移植到 Typert remote 命名空间；拉取退化为保留最后缓存行而非抛错。

## Required verification

- 插件仓 `node scripts/sync-to-qilin.mjs --check` 退出码 0（vendored 副本零漂移）。
- `pnpm run build` 双面通过；vendored 包的 tsconfig 纳入 host 聚合，tsdown 产出 node 半加 `@qilin/coding-sidebar` 客户端 bundle 与五个懒分块。
- `packages/boot/app-boot/tests/profile.spec.ts` 覆盖前侧栏 web 元组归一化到内置模板、已扩展 profile 保留自身列表。
- 以临时 `$QILIN_HOME` 启动 `qilin --profile web` 恰好挂载一条 `coding-sidebar` 行、四个原生标签类型行禁用且 `ui-sidebar-right` 存活；profile 插件升级模拟在不出现第二行的前提下换挂新副本（`packages/boot/app-boot/tests/profile.spec.ts` 覆盖两个方向的解析顺序）。
