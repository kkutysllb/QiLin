---
kind: upgrade-guide
description: "插件清单消费者必须接受不含版本的包配置项。"
---

# 插件清单版本改为可选

[English](guide.md) | 中文

## 变更

`@qilin-agent/plugin-package-inventory-deepseek/types` 的 `DeepSeekPluginPackageIdentity` 现在声明 `version?: string`，而非 `version: string`。当包 manifest 有有效名称但没有非空白字符串版本时，`qilin_plugin_packages` 请求字段可以包含 `{ name }`。该导出类型或 wire 字段的读取方必须处理版本缺失。外层清单协议仍为 `version: 1`。

## 迁移

1. 更新 `qilin_plugin_packages.packages` 的读取方与校验方，接受只带 `name` 的条目。在使用依赖版本的操作前检查 `entry.version !== undefined`；版本缺失时只显示包名。
2. 去重与序列化时保留只有名称的条目。不要编造包版本，也不要从父包复制版本。
3. 对消费方做类型检查，并用 `{ "name": "local-plugin", "private": true }` 这样的 manifest 实际验证：请求包含 `{ "name": "local-plugin" }`，且消费方在没有 `version` 字段时也能接受。
