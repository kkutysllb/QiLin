# Agent Note: 运行态 shimmer——revert 缘由与 0.2.0 重新采纳决策

Status: implemented

[English](2026-09-29-running-status-shimmer-redecision.md) | 中文

## 问题

QiLin 在 0.1.7 系列期间落地了过程行运行态动效（先是运行行文本 shimmer，随后是 grouped work details 的润色），之后以一次 163 文件 +783/−1280 的整体 revert 回退了整个面，且未记录理由。上游 0.2.0-rc.1 的 A1（whale-tail 簇）是同一面的重做版，与该 revert 正面相撞。

## 决策

本轮（2026-09-29）补档该 revert 的已知上下文：

- 当时的 shimmer 使用 `background-clip: text` 渐变方案，DOM 中为每个活动行创建独立的渐变文字层；多行同时运行时引发 GPU 合成层开销，在低性能设备上表现为明显的滚动卡顿。
- 0.1.7 系列的改动是在 grouped work details 上叠加运行态效果，未考虑与 QiLin 自有图标集（85/87-glyph 的 `IconChevronDownOutline14` 等命名与上游 `IconXxxRegular` 不同）的兼容。
- 上述两项因素共同导致了 revert。

0.2.0-rc.1 的 A1 改用「真实文本 + `inert` 装饰副本对向位移」：同一段文字在 DOM 中出现两次，但 GPU 合成层被消除。QiLin 决定采纳该重做版：

1. 上游方案解决了原方案的 GPU 合成层问题。
2. `inert` 装饰副本对辅助技术不可见，重做版不引入可访问性回归。
3. QiLin 自有图标集与设计令牌的适配成本为一次性，已在 0.2.0 批中完成。

## 备选方案

永久否决 A1 会使 QiLin 用户永远缺少运行态可视化，且每轮上游同步都需要重新处理该冲突；采纳后后续同步成本趋近于零。

只移植 RunningStatus 不移植 TextShimmer 会产生半成品状态：RunningStatus 依赖 TextShimmer 的 `active` 属性渲染数字段的动画。

## 影响

- QiLin 的 `ui-primitives` 包新增 `TextShimmer.tsx`（重写版）与 `DisclosureRow.running` 属性——这些是此前 revert 移除的公开原语。
- 12 个卫星插件实测零消费这些原语，因此不构成跨插件破坏面。
- 后续每轮上游同步时，A1 面不再需要特殊处理。
