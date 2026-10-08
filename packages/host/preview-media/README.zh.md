---
description: "预览媒体的宿主半：/sidebar/media 路由向内联预览供出会话工作区文件，带 HTTP Range 窗口供视频拖动进度条。"
kind: "package-reference"
---

# @qilin-agent/host-preview-media

[English](README.md) | 中文

## 概述

`/sidebar/media` 之下的两条 webServer 路由服务浏览器的内联预览。`GET/HEAD /sidebar/media?sessionId=<id>&path=<p>` 供出一个会话工作区文件。带 `Range` 头的请求以窗口读回答 `206`，文档预览的 video 元素因此可拖动进度条；`?download=1` 切换处置方式让浏览器保存文件。整文件回答受 `mediaLimitBytes` 约束。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [开发备注](#dev-note)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

在任何服务 Web 应用且需要内联媒体预览的组合中挂载。路由无需配置；`mediaLimitBytes`（默认 20 MiB）约束一次整文件回答，ranged 请求只读自身窗口、不受该上限约束。

### 预期行为

- 可满足的单区间得 `206` 与 `Content-Range`；起点越过 EOF 得 `416`；无可用 Range 头得普通 `200`。
- 读取经抽象文件系统服务解析，远程执行世界同样由此路由供出。
- connection 服务的请求拒绝（来源围栏加浏览器认证）先于一切字节放行。
- `PUT /sidebar/media/upload?sessionId=<id>&path=<p>` 经文件系统的 `writeBytes` 向会话工作区写入一个完整文件（创建或覆盖，无版本守卫）；请求体受 `mediaLimitBytes` 约束，超限在写入前即以 `400` 拒绝。文件页的拖放上传是它的调用方。

<a id="model-experience"></a>
## 模型体验

无，本包不注册工具、不贡献 prompt 小节、不追加会话事件；路由供出的是用户本就能经预览面读到的字节。

#### KV 缓存影响

无；本包既不组装也不发送任何提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **单窗口 Range**——每次请求只尊重一个 `Range` 规格；多规格头只服务第一个窗口。
- **整文件 GET 有界、上传一次性设限**——超过 `mediaLimitBytes` 的普通 `GET` 被拒绝，越过同一上限的上传体在写入前即被拒绝；没有分块或可续传传输。
- **处置方式全有或全无**——`?download=1` 对整个回答强制附件处置；没有可续传的部分内容下载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
