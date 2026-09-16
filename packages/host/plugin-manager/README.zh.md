---
description: 按 profile 管理 QiLin 或 DSH 插件的安装、升级、卸载与发现的 Remote 宿主服务。
kind: package-reference
---

# @qilin/host-plugin-manager

[English](README.md) | 中文

## 摘要

插件管理器通过 pluginManager Remote 提供设置页用户插件流程。它读取当前 profile，在 profile 目录运行 pnpm，协调 QiLin 与旧 DSH bundle 元数据，并返回有限长度的输出尾部与重启提示。社区发现使用 GitHub 的 topic:dsh-plugin 搜索，升级检查使用 npm dist-tags。

## 使用此包

在 profile 组合中挂载宿主服务，并通过生成的 Remote assembly 使用它。服务不会直接修改运行中的 Loader；安装、升级或卸载成功后会修改 profile 文件，必须重启 QiLin 才会重新组合 bundle 层。

如果协调时发现 profile 中安装了上游 DSH 时代的引擎包，变更会以与 CLI 相同的诊断失败——包括每个冲突包、它映射到的 QiLin 包与清除命令——profile 的 bundle 列表保持不变。上游引擎副本的解析优先于兼容层 fallback，激活它会加载第二份引擎实例。

尚未初始化的 profile 没有清单，此时列出空列表而不是让读取失败。每一层按解析通道上报 `updatable` 与 `removable`。内置层永不可卸载；由 profile 拥有的内置层（`PROFILE_OWNED_BUNDLES`）仍可原地升级，`updatePlugin` 用 `pnpm add <name>@latest` 命中它，使已安装副本优先于安装实例中的种子；随安装实例整体升级的层以及其余内置层都上报 `updatable: false`。

## 模型体验

无。本包只服务设置页操作，不增加模型可见行为。

### KV Cache 影响

无；本包不组装 provider 请求。

## 已知限制与后续工作

- 包操作要求 PATH 中存在 pnpm，且 profile 目录可写。
- GitHub 与 npm 查询依赖网络；请求失败时不会返回 registry 版本。
- 当前管理器不提供 pnpm 已提交文件后的回滚。
