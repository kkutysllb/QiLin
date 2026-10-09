# Agent Note：编码工作台移除，统一引擎原生右栏

Status: implemented

[English](2026-10-09-coding-workbench-removed-native-rightbar.md) | 中文

## Problem

双工作台设计（plans/2026-10-05，D5）为右侧 Sidebar 出了第二个内容体：`@qilin-agent/client-ui-sidebar-coding`——一个 VSCode 式工作台（资源管理器、编辑器、diff、git、浏览器页签、浮窗），背后还有 Node 宿主半边注册的 `/sidebar` 路由族——文件读写、git 操作、HTML 预览、懒加载 chunk、按会话隔离的终端 WebSocket。它把引擎原生右栏复制成了第二个内容体、第二个准入面，以及一整族需要围栏与维护的宿主 API，而两个工作台标签渲染进的是同一套框架 chrome。

## Decision

`ui-sidebar-coding` 删除。编码与通用两个工作台标签渲染同一个引擎原生右栏：`ui-sidebar-right` 移除 `rightbar.session.coding` 坐席与 workbench 钩子穿线，面板始终渲染 dockkit 套件。原先由编码侧边栏认领的打开请求（ui-agent-opens 的页面/文件路由、ui-schedule 的任务详情绕行）一律无条件走原生 Sidebar。

workbench 标签本身保留（`ui-workbench`）：它仍拥有按标签的插件准入面（ui-plugin-manager 的 audience gate），也是区分两种模式的组合开关。移除的只是编码内容体。

## Alternatives considered

**保留编码内容体、砍掉宿主 API 族。** 拒绝：工作台就是它的后端——没有文件 API 的资源管理器、没有 WebSocket 的终端、没有 git 读取的 diff，都不能动作；不能动作的内容体不是工作台。

**标签下保留两套内容体。** 拒绝：每个 QiLin 变更都要为第二套工作台与第二个围栏 API 族付维护成本，且编码内容体的修复（如 hover 修复所示）到达桌面走的是标签的节奏而不是代码的节奏。

## Consequences

`/sidebar` 路由族（资源管理器、文件媒体、HTML 预览、懒 chunk、终端 WebSocket）不复存在；脚本化使用这些端点的第三方会失去它们。滚动条门、源码泄漏基线、客户端 slot 目录、模块图与配置目录不再携带该包。双工作台设计的编码半边（plans/2026-10-05-dual-workbench-web-design.md）退为历史；通用半边与标签保留。
