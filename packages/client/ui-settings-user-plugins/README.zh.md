---
description: 设置页中的用户安装 QiLin 与 DSH 插件管理标签。
kind: package-reference
---

# @qilin/client-ui-settings-user-plugins

[English](README.md) | 中文

## 摘要

该浏览器插件在设置-插件下增加用户插件标签。它列出 profile bundle 层，检查 npm 最新版本，安装包 spec，升级或卸载用户层，并搜索 GitHub 的 topic:dsh-plugin 仓库。变更结果显示命令输出，并提示需要重启 QiLin。

## 使用此包

本包注册一个 settings.plugins.tab 贡献，只消费生成的 pluginManager Remote。标签组件拥有临时加载、错误、搜索和操作状态；profile 文件与包管理操作仍由宿主负责。

## 模型体验

无。本 UI 不改变 prompt、工具或 provider 请求。

### KV Cache 影响

无；本包不发起模型请求。

## 已知限制与后续工作

- 新安装的 bundle 必须重启 QiLin 后才能生效。
- registry 与 GitHub 可用性取决于网络和宿主服务配置。
- 当前标签提供包 spec 输入，没有维护白名单 registry。
