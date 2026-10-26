---
kind: upgrade-guide
description: "QiLin 仅依据 `@qilin-agent/` peer 范围检查插件兼容性；清单中的 `engines.dsh` 范围不会拒绝任何安装。"
---

# `engines.dsh` 保持 advisory

[English](guide.md) | 中文

## 变更

上游 0.2.1-alpha.3 让插件自身的 `engines.dsh` 范围单独决定兼容性，仅在该范围缺席时才应用 `peerDependencies`，把 `engines.dsh` 内的 `workspace:` 值视为不兼容，拒绝 `engines` 不是对象或 `engines.dsh` 不是字符串的清单，并把拒绝记录中的 `peers` 字段改名为 `requirements`。

QiLin 保持 `engines.dsh` 为 advisory。`packages/boot/app-boot/src/plugin-compatibility.ts` 中的 `evaluatePluginCompatibility` 读取指名 `@qilin-agent/` harness 包的 `peerDependencies`，从不读取 `engines`；安装与 profile 启动只使用该结果。`requirements` 改名已落地，其键是 peer 包名。vendored 框架包 `@qilin-agent/kylin`、`@qilin-agent/cosmokit`、`@qilin-agent/schemastery` 与 `node-addon-system`，以及 `@qilin-agent/kylin-plugin-*` 均被排除，因为它们的版本独立于 QiLin 发布。

QiLin 的发布版本无法满足上游插件的 `engines.dsh: ^0.2.x` 范围，因此让该范围决定兼容性会在读取 peer 之前就拒绝所有 DSH 插件。[`@qilin-agent/dsh-compat`](../../../../packages/util/dsh-compat/README.zh.md) 让 DSH 时代的插件保持可加载：它在 QiLin 清单键旁读取 `dsh.bundle.patch` 与 `dsh.client`，并把改名后的模块标识符规范化；它不模拟两个运行时之间的 API 漂移。

由此对使用者的影响：

- 只声明 `engines.dsh`、没有 peer 范围的包，不会被兼容性检查拒绝。
- 未满足的 `@qilin-agent/` peer 范围会以 `incompatible-version` 错误码拒绝安装，并逐条点名未满足的要求；profile 启动也会拒绝以该方式安装的包。
- Discover 列表依据索引中的 `engines.dsh` 为每个市场版本标注兼容性；该标注决定提供哪个版本，不构成安装授权（[插件市场 README](../../../../packages/boot/plugin-market/README.zh.md)）。

## 迁移

1. 为插件所需的运行时声明 `@qilin-agent/` peer 范围，因为只有这些会被检查。保持 `engines.dsh` 对上游安装准确，但不要在 QiLin 中依赖它。
2. 把 `requirements` 的键读作 peer 包名。键 `engines.dsh` 只出现在市场列表记录中。
3. 若要安装 peer 范围所指运行时版本不被本 QiLin 满足的插件，用 `qilin plugin allow-version <package@version> --qilin-version <runtime> --accept-risk` 或插件管理器的豁免操作授予精确版本豁免。`qilin plugin version-exemptions` 列出授权，`qilin plugin revoke-version <package@version> --qilin-version <runtime>` 移除授权。授权保存在 profile 的 `compatibility.json`，在下次组合时生效，且插件升级与 QiLin 升级都不继承它（[插件管理器 README](../../../../packages/boot/plugin-manager/README.zh.md#version-compatibility-and-exemptions)）。
4. 确认：安装 peer 范围未满足的包会打印精确的 `allow-version` 命令；授权并重启后插件加载成功，且 `version-exemptions` 列出该组合。
