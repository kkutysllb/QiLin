# Agent Note: 窗口拖拽覆盖作为约定

Status: implemented

[English](2026-09-19-window-drag-coverage-contract.md) | 中文

## Problem

macOS 桌面窗口的可拖拽区域被书写两遍。布局决定 chrome 行在哪里——它们的高度与内容——而手写的 app-region 声明决定什么可拖：每个 chrome 行一条声明，外加散布在各功能样式表中的逐盒减除。两份描述靠手工保持一致，于是会漂移：行的盒子与拖拽带不匹配时，chrome 落到拖拽面之外，或内容落进拖拽面之内——差几像素没点到控件的一次按压会拖动窗口，在那里双击还会触发系统的标题栏动作。

## Decision

覆盖成为有四个可执行部分的约定：

1. ui-web 的 `window-drag/regions.ts` 把组合规则发布为可执行模型——当一个点所落在的最后一个 app-region 盒声明 `drag` 时该点可拖，即原生窗口采用的按 DOM 顺序的几何组合——连同 `INTERACTIVE_SELECTOR`，即 ui-web base.css 所声明的交互减除的唯一来源。base-styles spec 断言样式表声明的正是这份列表，两者不会漂移。
2. Shell 恰好声明一次 darwin 拖拽面：ui-web base.css 中的 `html[data-platform='darwin'] [data-window-drag]`。每个 chrome 行在标记中给自身打标，行的盒子就是窗口的可拖几何，任何固定拖拽带都不必匹配任何行的高度。ui-theme 的 app-region 门持有清单，把每行的标记与其样式表、类选择器、已定高度配对，并拒绝清单未点名元素上的任何标记。QiLin 的清单：侧边栏顶部条（ui-sidebar；logo 行保持内容态，品牌按钮在 darwin 上保留 New Session 快捷入口）、会话头部（ui-conversation）、右侧边栏的 dockkit 条行（ui-dockkit）、插件管理器的页面头与共享详情头（ui-plugin-manager）。
3. 浏览器车道新增 `window-drag-coverage`，在 Chromium 中以 `data-platform='darwin'` 引导真实组合，经模型断言拖拽面内没有任何交互盒，并给出各 chrome 行的逐行探针。QiLin 把插件管理器渲染在 portal 的设置模态之内，因此车道没有入口页遍历；它改为断言打开的覆盖浮层会减除整个窗口。
4. Shell 拥有唯一的重收集监视器——ui-web 的 `window-drag/recall.ts`，由引导内核安装。拖拽面可能移动期间它每帧测量每个已标记行，几何变化的帧把 `data-window-drag-recall` 打到 body 上，几何在短暂宽限窗口内保持不动后清除。它上报拖拽面移动的所有原因：触及已标记行或其容器的 DOM 变化、已标记行的盒子尺寸变化、以及持有已标记行的元素上开始的 transition 或 animation。任何 chrome 行都不再自带脉冲。

原生的一半——按压究竟拖动窗口还是到达页面——仍是清单，因为没有无密钥的 CI 车道能到达窗口服务器：本层任何变更都要跑下面的状态矩阵。

## Alternatives considered

**由 JavaScript 发布测量矩形作为合成拖拽盒。** 几何必须以指针节奏重推，而一个过期帧正是本工作要消灭的吞噬类；CSS 推导的区域按构造不会过期。

**全局背景拖拽（`movableByWindowBackground` 读法）。** 在任何非控件处拖拽会破坏文本选择与空白区点击。

**每行在自己的样式表中声明拖拽。** 那样每个样式表都在转述窗口几何，仅布局移动的行仍要在 CSS 中重新声明；基于标记的单条 shell 规则把声明数保持为一，清单把标记与门仍能检查的几何配对。

**把当前覆盖固定为一份 golden 快照。** 那会把两类失败与正确行为一起冻结；清单把不变量（无被吞噬的控件）与跟随布局的行几何分开。

## Consequences

- 新控件无需拖拽声明：交互选择器会减除它。新 chrome 行给自身元素打上 `data-window-drag` 并在清单中加入钉住其高度的条目，没有拖拽带算术，也不必改其他样式表。
- 行自己的盒子就是全部可拖几何，内容容器永远不会是。插件管理器的详情视图标记它们共享的头行，而不是渲染它们的详情容器：标记容器会让窗口在文本与表单标签上拖拽。
- 整个包树恰好在两处声明拖拽面——shell 的标记规则与 Windows 标题栏行（AppFrame 的 `[data-windows-titlebar]` `::before`，该平台自己的 chrome）。
- 设置浮层 portal 到 `#root` 旁，且不携带逐样式表的 `no-drag` 规则：root 内的覆盖面先于列 chrome，后声明的拖拽行会覆盖它的减除；ui-web base.css 的 `body > :not(#root)` 规则在 portal 副本与拖拽行重叠的任何位置减除它。浏览器车道在浮层打开时断言该位置。
- 跨隐藏/可见边缘滑动的行无法只靠布局变化：只有计算出的 app-region 值变化才会让 Electron 重收集窗口的拖拽矩形（electron#32341），且 Blink 收集时会跳过隐藏盒。监视器一次性为所有行关闭该缺口，右侧面板不再自带脉冲。

## Testing

- `packages/client/web/tests/window-drag-regions.client.spec.ts` — 组合规则，含顺序敏感性与盒边缘。
- `packages/client/web/tests/base-styles.client.spec.ts` — base.css 声明模型的交互选择器、唯一的 darwin drag 规则、以及 recall 标记的减除。
- `packages/client/ui-theme/tests/app-region-styles.client.spec.ts` — 拖拽所有权、行清单、每行的标记；清单外标记或行高变化都会失败。
- `packages/client/ui-dockkit/tests/app-region-styles.client.spec.ts` — 条行自身的减除；它的拖拽来自标记，样式表自己不声明。
- `packages/client/web/tests/window-drag-recall.client.spec.ts` — 经两个 seam 驱动监视器：什么重新武装它、忽略什么、settle 循环、shell 默认值与清理。
- `apps/web/tests/window-drag-coverage.e2e.ts` — 真实 Chromium：无被吞噬控件、面板条行/会话头部/侧边栏顶部条逐行探针、收起态的头部区段、portal 浮层、以及右侧面板滑动时 shell 发出的 recall 脉冲。
- 真机验证仍是手工矩阵（下表）；自动化车道经共享模型证明几何，而非 HID 输入。

## Manual state matrix

在本层任何变更时于打包的 macOS 应用上运行。每格同时验证两半：拖拽行的空白段（窗口必须移动）并点击行的控件（必须执行动作而非拖拽）。

| 状态 | 要走的行 |
| --- | --- |
| 侧边栏展开、选中会话、显示视图 tab | 侧边栏顶部条、会话标题行、会话 tab 条行、这些行中的每个控件 |
| 侧边栏展开、选中会话、单视图（无 tab） | 同上行，外加头部下方的 transcript 前几行 |
| 侧边栏收起 | 居中的会话头部、其 leading 座重开控件、New Session |
| 右侧边栏推入 | 面板条行及其控件、条行下方窗格体区段、窗格分隔条顶部段 |
| 右侧边栏全屏 | 红绿灯处的面板条行、首窗格条行内缩、其控件 |
| 设置模态打开 | 窗口内任何行都不拖拽；模态内每个控件保留点击 |
| 窗口全屏开/关 | 红绿灯隐藏时上述每行、两种侧边栏状态 |
| chrome 行空白段内双击 | Windows 上标题栏行触发系统标题栏动作（最大化/还原）；macOS 上 darwin 行是 app-region 区域而非标题栏，不期望系统动作——只有控件保留自己的双击 |
