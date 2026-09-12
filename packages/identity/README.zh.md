---
description: "identity 包组：遥测、反馈与 DeepSeek 提供方请求共享的匿名按 harness home 关联 id，以及为 Web 部署设置门禁的本地浏览器账户。"
kind: "package-group"
---

# identity/ — 共享身份

[English](README.md) | 中文

## 概述

identity 组回答关于同一个 harness home 的两个问题：它外发的记录属于哪套安装，以及谁可以到达它。每个 home 的匿名 id 由遥测、反馈与 DeepSeek 请求附加到记录上，因此离开该 home 的一切都无需识别用户即可辨认；它无需配置，并在文件被删除前保持稳定。本地浏览器账户为 Web 部署的应用文档与 `/api` 表层设置门禁，首次注册即初始化管理员账户。本组有两个包；本页是组的映射，各个包 README 负责细节。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 职责 |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.zh.md) | 让每个 harness home 拥有一个匿名 id，遥测、反馈与 DeepSeek 请求把它附加到记录上，使来自同一安装的记录无需识别用户即可被辨认 |
| [`accounts-local`](accounts-local/README.zh.md) | 要求浏览器账户登录后才提供应用文档或应答 `/api`，账户文件、密码哈希与会话 cookie 都位于 harness home 之下 |

<a id="related-documentation"></a>
## 相关文档

- [会话遥测子系统](../../docs/subsystems/session-telemetry.zh.md)——在导出中携带该 id 的遥测功能。
- [qilin-llm-deepseek](../llm/llm-deepseek/README.zh.md)——在请求中携带该 id 的 DeepSeek 提供方。
- [qilin-command-feedback](../feedback/command-feedback/README.zh.md)——在确认文本中点名该匿名安装的反馈命令。
- [qilin-client-connection](../client/connection/README.zh.md)——拥有账户会话 authority 所认领的 index 与 `/api` 门禁的 transport。

<a id="dev-note"></a>
## 开发备注

无。
