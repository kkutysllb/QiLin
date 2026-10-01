---
description: "预览媒体的宿主半：/sidebar/media 路由向内联预览供出会话工作区文件，带 HTTP Range 窗口供视频拖动进度条。"
kind: "package-reference"
---

# @qilin/host-preview-media

[English](README.md) | 中文

## 概述

一条前缀 webServer 路由 `GET/HEAD /sidebar/media?sessionId=<id>&path=<p>`，向浏览器内联预览供出一个会话工作区文件。带 `Range` 头的请求以窗口读回答 `206`，文档预览的 video 元素因此可拖动进度条；`?download=1` 切换处置方式让浏览器保存文件。整文件回答受 `mediaLimitBytes` 约束。

## 使用本包

在任何服务 Web 应用且需要内联媒体预览的组合中挂载。路由无需配置；`mediaLimitBytes`（默认 20 MiB）约束一次整文件回答，ranged 请求只读自身窗口、不受该上限约束。

### 预期行为

- 可满足的单区间得 `206` 与 `Content-Range`；起点越过 EOF 得 `416`；无可用 Range 头得普通 `200`。
- 读取经抽象文件系统服务解析，远程执行世界同样由此路由供出。
- connection 服务的请求拒绝（来源围栏加浏览器认证）先于一切字节放行。

## 模型体验

路由供出的是用户本就能经预览面读到的字节；不注册工具、不进入模型上下文，token 与 KV 缓存影响为无。

## 已知限制与后续工作

无。
