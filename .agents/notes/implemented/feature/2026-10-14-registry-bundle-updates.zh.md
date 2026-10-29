# Agent Note：注册表组合包的更新会检查每个已发布版本

Status: implemented

[English](2026-10-14-registry-bundle-updates.md) | 中文

## 问题

从 npm 注册表安装的第三方组合包，在产品内没有获知更新版本的途径。**插件**页面显示已安装版本与来源 spec，更新意味着手工移除再安装，既丢失组合层选择，也无法报告失败原因。

三个事实让朴素实现出错。以范围（`^1.0.0`）保存的注册表 spec 在安装时解析为注册表当时的版本，所以重装同一 spec 不是更新，也不指名版本。`pnpm view <spec> --json` 只打印范围的最高匹配，一次查询无法列出高于已安装版本的版本。而新版本失败时，取代它的包可能被留在未安装状态，这恰是用户已失去可用插件的时候。

## 决定

1. **版本列表由一次无范围查询加上每个候选各一次查询组成。** `listVersions` 先问 `pnpm view <name> versions time dist-tags` 取已发布版本，保留高于已安装版本的最新 `versionListLimit` 个，再以 `versionLookupConcurrency` 的并发读取每个候选的 `name version engines peerDependencies deprecated qilin`。只有单版本读取才能报告组合包声明、弃用与 peer 兼容性，也只有它能区分不能取代组合包的版本与可以取代的版本。
2. **更新是先检查、再移除、再安装，失败时重装被移除的版本。** `updateBundle` 在改动任何东西之前读取目标的事实：版本缺失、没有 `qilin.bundle`，或 peer 拒绝运行中的 QiLin，都会停在 `step: 'check'` 且 profile 不变。启用 HMR 时它随后移除已安装版本（其插件随之停止），安装精确目标；当该安装失败、被取消，或装上却未能启动时，移除可能留下的目标，并从该包来源的注册表重装先前版本。重装不带 request id，因此取消更新无法取消恢复。没有 HMR 时目标覆盖运行中的版本安装，结果报告 `restart-required`。
3. **资格是推导出来的，不存储。** `listBundles` 在满足以下条件时把组合包标记为 `updatable`：它是以其自身名称的注册表 spec 保存的 profile 依赖（不是 `npm:` 别名、link 或路径），其已安装清单声明 semver 版本，且不承载插件管理。`plugin_manager` 工具会剔除该字段，因为该工具不提供更新动作。

## 考虑过的替代方案

**通过 HTTP 获取精简 packument。** 一次请求即可返回每个版本的 `peerDependencies` 与 `deprecated`，但 Host 必须自行从 `.npmrc` 链解析注册表、scope、认证与代理设置，并保持与 pnpm 的解析一致。来自 pnpm 不会从中安装的注册表的列表，会显示无法安装的版本。

**`pnpm outdated`。** 它只报告 current、wanted 与 latest，不判断 QiLin peer，而在确切版本保存下 wanted 等于 current。

**在浏览器中编排移除与安装。** 官方组合包的更新就是这样做的。浏览器在两次调用之间关闭或断开连接时，包已被移除且无人重新安装，而移除前的目标检查会成为 Host 规则的第二份、可被绕过的副本。

**在读取组合包时列出版本。** `listBundles` 不联网；加入注册表查询会让打开插件页变成网络操作，且每个版本一个子进程。

## 后果

- 检查一个包需要一次 `pnpm view`，再加上每个列出版本一次，每次都受 `inspectTimeoutMs` 限制。
- 更新保存的目标版本，以及失败后重新安装的版本，都是确切版本，即使 profile 原先保存的是范围；有 HMR 时，组合包排到选中列表末尾。
- 移除与安装分别获取 profile 锁，其他操作可能在两者之间运行；安装被拒绝（例如锁等待超时）时，同样会触发重新安装。
- 依赖需要新的构建脚本批准的版本会安装失败，并重新安装为原版本；其脚本通过普通安装批准。
- 重新安装也失败时，包处于未安装状态，对话框会如实说明。

## 验证

`packages/boot/plugin-manager/tests/manager.spec.ts` 覆盖降级拒绝、不兼容与非组合包拒绝、安装失败后恢复上一版本、取消、拒绝、装上却无法启动、移除被拒绝、重装也失败而留下未安装，以及无 HMR 路径。`packages/client/ui-plugin-manager/tests/manager-store.client.spec.ts` 覆盖候选选择、每个包只检查一次、其他操作重装该包后检查被遗忘，以及更新的步骤与结果报告。
