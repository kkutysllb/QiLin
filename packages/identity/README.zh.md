---
description: "identity 包组：由遥测、反馈与 DeepSeek 提供方请求共享的匿名关联 id，每个 harness home 一个；以及为 Web 部署把关的本地浏览器账户。"
kind: "package-group"
---

# identity/ — 共享身份

[English](README.md) | 中文

## 概述

identity 组为每个 harness home 回答两个问题：它发出的记录属于哪套安装，以及谁可以访问它。遥测、反馈与 DeepSeek 请求会附加每个 home 一个的匿名 id，因此离开该 home 的所有内容都能被识别为来自同一套安装，而无需识别用户身份；它无需配置，并在文件被删除前保持稳定。本地浏览器账户为 Web 部署的应用文档与 `/api` 面把关，首次注册会初始化管理员账户。本组有两个包；本页列出本组的组成，包 README 负责细节。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 职责 |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.zh.md) | 让每个 harness home 拥有一个匿名 id，遥测、反馈与 DeepSeek 请求把它附加到记录上，使来自同一安装的记录无需识别用户即可被辨认 |
| [`accounts-local`](accounts-local/README.zh.md) | 在 Web 部署提供应用文档或响应 `/api` 之前要求已登录的浏览器账户，账户文件、密码哈希与会话 cookie 都存放在 harness home 下 |

<a id="related-documentation"></a>
## 相关文档

- [会话遥测子系统](../../docs/subsystems/session-telemetry.zh.md)——在导出中携带该 id 的遥测功能。
- [qilin-llm-deepseek](../llm/llm-deepseek/README.zh.md)——在请求中携带该 id 的 DeepSeek 提供方。
- [qilin-command-feedback](../feedback/command-feedback/README.zh.md)——在确认文本中点名该匿名安装的反馈命令。
- [qilin-client-connection](../client/connection/README.zh.md)——拥有 index 与 `/api` 关卡的传输层，账户会话权限在此声明。

<a id="dev-note"></a>
## 开发备注

无。
