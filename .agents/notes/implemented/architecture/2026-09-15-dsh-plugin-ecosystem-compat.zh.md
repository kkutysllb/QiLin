# Agent Note: DSH 插件兼容与按 profile 管理用户插件

Status: implemented

[English](2026-09-15-dsh-plugin-ecosystem-compat.md) | 中文

## Problem

QiLin 需要加载使用 dsh.bundle 与 dsh.client manifest、请求 @deepseek-ai/dsh-* 浏览器模块名、并通过旧 peer 名称导入宿主包的 DSH 时代插件。设置页也需要让用户安装、升级和卸载 profile 插件，同时区分 profile 文件变更与运行中的 Loader 状态。

## Decision

QiLin 优先读取 qilin 元数据，再回退到 dsh 元数据。app-boot 模块 fallback 将 DSH 依赖名规范化到已安装的 QiLin 包目录，并同时发布两个名称，使旧宿主导入继续使用同一个 QiLin 引擎实例。客户端模块图和静态种子别名使用同一兼容映射。

profile 变更由 @qilin/host-plugin-manager 负责。pluginManager Remote 在启动 profile 中运行 pnpm，成功后协调 bundle 层，限制保留输出，并返回 restartRequired，因为当前启动的 bundle 组合已经冻结。

每行的权限跟随其解析通道。内置层永不可卸载。profile 拥有的内置层（PROFILE_OWNED_BUNDLES）优先解析 profile 副本，因此通过 `add <name>@latest` 原地升级——即桌面插件管理器的「内置但可更新」一类；其余内置层随安装实例整体升级，既不可更新也不可卸载。Remote 方法名必须避开客户端 namespace service 自身的表面——它保留了 `install`、`remove` 等字段与成员；管理器把安装语义暴露为 `installPlugin`、`updatePlugin`、`uninstallPlugin`，并由 `isRemoteMethodNameAvailable` 作为共享判据固定该规则。

设置页插件分区通过 settings.plugins.tab 接收独立的 user-plugins 标签。它只消费生成的 manager Remote，所有 UI 文案经过本地化，展示版本和来源，并支持 registry 升级检查、包安装、GitHub topic:dsh-plugin 发现、升级和卸载。

## Alternatives considered

- 不扩展 plugin-inventory，因为它是只读 Loader 投影，变更会混淆所有权。
- 不热挂载新安装 bundle，因为 composeLive 复用启动时 patch，会产生第二个组合真源。
- 不只保留客户端别名，因为 DSH 宿主包也会通过 Node 解析导入旧名称。

## Consequences

依赖已重命名 QiLin API、Electron bridge 或不兼容 resource scheme 的 DSH 包仍需逐个验证。包操作要求 pnpm 和可写 profile，成功变更必须重启进程后才会激活。浏览器级安装与重启验收仍依赖部署环境。

## Verification

兼容层、profile、manager 与客户端模块测试通过；Host/Client TypeScript 聚合、客户端包检查、本地化、导出 JSDoc、包路径、GUI、生成产物和空白检查通过。依赖策略仍有一个与本次无关的既存 @qilin/fs#FsVersion 分类问题。
