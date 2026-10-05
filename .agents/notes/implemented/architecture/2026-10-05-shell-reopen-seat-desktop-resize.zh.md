# Agent Note: Shell reopen 座位与桌面端拖拽把手

Status: implemented

[English](2026-10-05-shell-reopen-seat-desktop-resize.md) | 中文

## 问题

产品桌面壳运行本 web 客户端时报告的三处桌面形态缺口：

- 全局面板页（例如插件页）会卸载会话头，而会话头是 reopen 控件（`HeaderLeadingControls`）唯一的挂载点。macOS 桌面折叠后侧栏完全隐藏，这类页面就没有任何重新展开侧栏或新建会话的入口。
- 列拖拽把手按跨平台契约是不可见的 8px 命中条。桌面壳里既没有 rail 也没有 chrome 边缘可以提示它的存在，不可见等于没有拖拽能力。
- 右栏首次展开取帧宽的 45%（`RIGHTBAR_DEFAULT_RATIO`），宽窗口下挤压中列。

## 决策

- 新增 frame 自有的子槽位 `'shell.reopen'`，由 `ReopenSeat` 渲染；它自行订阅主面板 key（与 `MainPanel` 同样的隔离：面板切换不得让列框重渲染）。仅在全局面板激活时挂载，因此该座位与会话头的 leading 控件永不同屏；ui-sidebar 把同一 occupant 注册到两个座位。宿主容器点击穿透，也不自带拖拽行——下方的页面头已拥有那条带，且 app-region 清单门会拒绝未登记的 chrome 行。
- 把手握把（`::after`，hover 与拖拽中显形）只挂在 `[data-platform='darwin']` / `[data-windows-titlebar]` 下；web 维持上游隐形命中条契约。
- `RIGHTBAR_DEFAULT_RATIO` 降为 0.32。只有首次展开走它：解析出的宽度随后落盘，之后的展开复用已存偏好（stores.ts）。

## 备注

- `ui-theme` 的 app-region 与 scrollbar 红、`pdf-license-bundle` 的 pack 预算红、`ui-chat` 的侧栏浏览器链接红，在本分支改动前的提交上同样复现；均为预存红，此处不处理。
