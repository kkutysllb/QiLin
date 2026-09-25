# Agent Note: 桌面关闭快捷键跟随页面焦点

Status: implemented

[English](2026-09-21-desktop-page-close-shortcuts.md) | 中文

## Problem

关闭命令有两个目标：聚焦的右侧边栏页面，或没有可关闭页面时的 Desktop 窗口。Electron 原生 close 角色绕过页面属主。在 Windows 上，关闭最后一个窗口还会退出 Desktop 实例并停止其 Host 任务，因此这个回退是生命周期选择，而不只是菜单文案变化。

## Decision

原生半边已落地。macOS 的 File 菜单承载 Close 条目：它显示已接受的单键绑定，并经渲染进程的命令分发路由，而非原生 close 角色。原生关闭要求当前配置 revision、聚焦且启用的产品窗口、以及非录制中的快捷键状态；录制会话与过期 revision 一律拒绝。既有窗口生命周期保持不变、不附加快捷键专属确认：macOS 在最后一个窗口关闭后保持应用存活；Windows 与 Linux 退出并停止 Host。[快捷键偏好持久化](2026-09-20-device-local-shortcut-preferences.zh.md) 拥有已接受绑定与 revision 发布。

页面半边——按实时焦点解析关闭、捕获目标的 Session、窗格、tab occurrence 与导航 revision、并经其资源清理处理器关闭该页面的客户端 `page.close` 属主——延后到侧边栏的聚焦目标机制落地。在其注册之前，目录中的命令没有生效绑定，菜单条目保持禁用，原生 close 角色仍是唯一的关窗路径。

## Alternatives considered

**使用 Electron 原生 close 角色。** 它不询问聚焦页面属主直接关窗，无法保留页面清理或已接受自定义绑定的路由。上述桌面守卫在不改变关闭行为的前提下把路由缝备好。

**基于 QiLin 当前侧边栏控制器注册页面属主。** 该控制器没有聚焦目标身份（Session、窗格、occurrence、revision），经它解析的关闭无法区分存活页面与过期目标；命令要么关错页面，要么需要一整套新的生命周期。延后让目录中的保留条目保持诚实。

**禁用 Windows 窗口回退。** 这避免了停任务的关闭快捷键，但也丢掉了 Desktop 回退。产品保留原生关窗语义；需要应用保持运行的用户可以最小化它。

## Consequences

今天关闭行为与原生 close 角色完全一致：桌面守卫在页面属主注册前处于休眠，File 菜单条目以禁用状态如实表达。在 Windows 与 Linux 上，关闭最后一个窗口会因退出实例而停止活动任务；命令不增加后台 Host 生命周期或任务感知的关闭确认。桌面键盘测试覆盖 revision、焦点与录制守卫；页面属主工作落地时自带焦点与过期目标测试。
