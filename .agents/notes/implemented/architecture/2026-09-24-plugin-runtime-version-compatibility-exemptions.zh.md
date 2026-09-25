# Agent Note: Plugin runtime-version compatibility with per-profile exemptions

Status: implemented

[English](2026-09-24-plugin-runtime-version-compatibility-exemptions.md) | 中文

## Problem

插件在 `peerDependencies` 里声明它需要的 harness 包，但在插件代码运行之前没有任何环节读取这些范围。为另一个 harness 版本构建的插件可以正常安装、正常挂载，然后在之后以无法解释的注册错误或 API 错误失败——这正是 [DSH 插件兼容性笔记](2026-09-15-dsh-plugin-ecosystem-compat.zh.md)归因于第二份引擎副本的那类失败，只是从相反方向抵达。拒绝一个指名了不兼容包的安装，需要一个运维者可以为单个包推翻的决定，因为一个正常工作的部署完全可能依赖某个声明落后于发布的插件。

## Decision

**在每个准入点，声明的 `@qilin/` peer 都会与正在运行的 runtime 版本比对，并且 profile 可以豁免一个确切的插件/runtime 组合。** runtime 版本来自 `getQilinRuntimeVersion()`，读取 app-boot 的 manifest，因此 `qilin --version` 打印的值就是参与比对的值。只有作用域为 `@qilin/`、且不是 vendored 框架、基础或 Loader 插件包时，peer 才参与比对：`@qilin/kylin`、`@qilin/cosmokit`、`@qilin/schemastery`、`@qilin/node-addon-system` 与 `@qilin/kylin-plugin-*` 的版本独立于 harness 发布，用发布版本比对会拒绝每一个正确声明它们的插件。`workspace:^`、`workspace:~`、`workspace:*` 表示正在运行的 runtime；预发布版本参与范围匹配。范围格式错误或缺失都算不匹配；在不匹配时，若 manifest 没有自身的非空 `name` 或 `version`，则直接抛出而不是匿名报告。

**豁免是 profile 本地的独立元数据，不可读时对写入采取 fail-closed。** `compatibility.json` 位于 profile 目录，与 `package.json`、`cordis.patch.yml` 并列；它以 `0600` 权限、在自身的文件锁下原子写入，内容为确切的 `package-name@version` 键映射到确切 runtime 版本列表。写它不会改动任何依赖、bundle 选择或 patch 层。读取对 profile 刻意 fail-open：文件缺失不授权任何内容；无法读取或解析的文件同样不授权任何内容，但会报告每一条被拒记录，并保留它接受的记录，因此坏文件永远不会让 profile 无法启动。写入则相反。只要存在被拒记录，文件就是 `rewritable: false`，此时授予或撤销会连同读取器的告警一起拒绝，而不是重写文档，因为重写会丢弃必须由运维者手工修复的内容。修复属于运维者，且是让该文件重新可写的唯一途径。

**授权只覆盖那个确切被拒的组合，且授予只能指名正在运行的 runtime。** 键是插件安装后的自身名称与版本，绝不是安装 spec、别名或范围；值会与运行版本精确比对，包括 build metadata。因此插件升级、降级或 runtime 升级都不会继承任何授权。授予还要求 `acceptRisk: true`，调用方只在已告知运维者不兼容插件可能使应用崩溃或损坏数据之后才设置它；服务只校验该确认与两个身份，从不校验对话历史。授予若指名任何非运行中的版本都会被拒绝，并改而指出当前版本。撤销不需要确认，且可以指名历史 runtime，因此在较早发布上留下的授权仍可撤回，而撤销某一对 runtime 中的一个不会影响它在其他 runtime 上的授权。

**四条准入路径应用同一策略，其中两条不是插件行。** 插件行经 `prepareProfileEntries`/`prepareProfilePatches` 到达 Loader，因此被拒的行在任何插件代码被导入之前就以 disabled 挂载，而触及被拒插件的 Include 会整体被拒。bundle 行不是插件行，所以行准入永远不读它自身的 peer：`loadProfileDirectory` 会评估每个 `qilin.profile.bundles` 条目，对 profile 未豁免的条目大声失败于启动阶段，与未声明 patch 的 bundle 同等对待。preset 行经由 `mountPreset` 到达其树，其 entry group 把每次 `Include` 更新都送进同一套准入，因此 agent preset 会把被拒插件声明为有意不活动，而不是导入失败。安装命令在能读到指名 manifest 时于 pnpm 运行之前判定——本地路径从磁盘读，registry spec 经 pnpm 自身的查询——在不能读到之时于安装之后判定，例如 git 或 tarball spec，或 peer 需要已安装目录树的 bundle 组件；拒绝会恢复 `package.json` 与 lockfile，而这次运行未触碰的依赖永远不会阻塞无关操作。

**拒绝是类型化的，并指名补救方式。** `ManagementError.code` 新增 `incompatible-version`，携带 `IncompatiblePlugin` 记录（`name`、`version`、`runtimeVersion`，以及仅未满足的 `peers`），由各界面自行渲染：Web 页面经其 locale 字典，工具结果作为 JSON，CLI 则为每个被拒包打印确切的 `allow-version` 命令。CLI 暴露 `qilin plugin --profile <profile> version-exemptions`、`allow-version <package@version> --qilin-version <exact> --accept-risk` 与 `revoke-version <package@version> --qilin-version <exact>`；同一组操作以 `plugin_manager` 的 `list_version_exemptions` 与 `set_version_exemption` 动作到达模型。授予在下一次组合时生效：live profile 会重新组合并报告 `applied`，startup-only profile 报告 `restart-required`。

`version-exemptions`、`allow-version`、`revoke-version` 三个子命令是 QiLin 对上游移植的本地增补：上游 CLI 把每个转发的参数列表都交给共享的 profile 操作，而 QiLin 的 `qilin plugin` 为 DSH 时代引擎名拒绝与双通道 bundle 归并保留了自己的 pnpm 调用，因此它直接调用共享的安装前检查。

## Alternatives considered

- 把豁免存进 profile 的 `package.json` 被拒绝，因为 profile manifest 是用户自己的包项目：授权会表现为依赖改动，被普通 pnpm 命令重写，并且无法与 bundle 选择区分。
- 用单一 `compatibility.json` 但不做写入拒绝被拒绝，因为读取器刻意保留它接受的记录：静默重写一个还含有被拒记录的文件会删除运维者的文本且不作报告。
- 预授权一个范围、一个不带版本的插件名，或一个未来的 runtime 被拒绝，因为风险特定于某一个被加载的组合，而超出其所针对版本的授权就是未经审阅的批准。
- 把 vendored 框架包当作 runtime peer 被拒绝，因为 `@qilin/kylin`、`@qilin/cosmokit`、`@qilin/schemastery`、`@qilin/node-addon-system` 携带各自版本，该规则会拒绝正确插件。
- 跳过被拒 bundle 而不是让启动失败被拒绝，因为一个列出自己并不运行的层的 profile 就是配置错误，而 profile 加载器对已列出却无 patch 定义的 bundle 本就大声失败。
- 仅告警而不拒绝被拒绝，因为那时安装已经运行过 build 脚本并替换了 `node_modules`；这项检查的存在就是为了让不兼容版本不落盘。

## Consequences

声明落后于某个兼容发布的插件需要按包、按 runtime 版本显式授权，这是刻意的摩擦：授权正是人类已接受该风险的记录。授权不跨 profile 移植，运维者复制 profile 目录时必须一并复制 `compatibility.json`。安装前拒绝不在磁盘上留下任何东西，但安装后拒绝会恢复 manifest 与 lockfile 并重装恢复后的 lockfile，因此已被允许的 build 脚本副作用可能残留。这次运行未触碰的依赖会保留在磁盘上并仅作告警；真正拒绝它的是 profile 启动。含有被拒记录的 `compatibility.json` 会阻塞所有授予与撤销，直到手工修复，这是刻意的 fail-closed，也是运维者必须在产品之外解决的唯一状态。peer 规则只覆盖 `@qilin/` 名称，因此完全不声明 harness peer 的插件依旧被准入，并在运行时像以前一样受判定。

## Verification

`packages/boot/app-boot/tests/plugin-compatibility.spec.ts` 固定 runtime 版本的读取、包含预发布与 `workspace:` 形式的范围语义、vendored 包排除、畸形 manifest，以及含原型名插件名的豁免身份。`profile-compatibility.spec.ts` 固定确切身份、仅属主权限、畸形记录处理、写入拒绝与历史 runtime 撤销。`compatibility-preflight.spec.ts` 启动真实 profile，断言被拒插件从未被导入、只有被豁免的组合被准入，以及 bundle 行与 preset 行准入行为一致。`profile.spec.ts` 固定 bundle 的大声拒绝与其豁免。`apps/cli/tests/plugin.spec.ts` 固定三个子命令、其畸形输入与安装前拒绝，`plugin-compatibility.expected.e2e.ts` 针对构建产物完成安装、启动、授予与撤销。豁免授权同样被断言绝不会出现在 profile manifest 中。
