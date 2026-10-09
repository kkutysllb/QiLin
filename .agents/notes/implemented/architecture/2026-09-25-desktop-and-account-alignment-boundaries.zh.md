# Agent Note：上游账号栈边界

Status: implemented

[English](2026-09-25-desktop-and-account-alignment-boundaries.md) | 中文

## 问题

本笔记的桌面壳半边（桌面壳不进本仓、上游桌面变更不移植）已于 2026-10-09 被推翻：OpenKyLin 仓库以 `desktop/` 并入本仓，引擎依赖反转为本仓工作树。见[合并笔记](2026-10-09-openkylin-desktop-merged-into-qilin.zh.md)。本笔记现在只承载账号栈边界；下方保留的 web 侧接口继续成立，消费方是仓内桌面壳。

本 fork 保留了上游账号栈的预备代码，这与本 fork 的产品形态冲突：账号面是 QiLin 自有的 ui-account 设计。没有记录在案的边界，上游账号提交就会不断诱发本仓库不应接受的移植。

## 决策

QiLin 账号面为自有 ui-account 包及其 `/api/auth` gate。上游 deepseek-account 栈——账号服务、deepseek 账号 LLM provider、账号设置 UI 及其配额 UI——一律不移植。为该栈预留的 llm 核心账号额度失败 code 已删除；提供方中立的 `QUOTA` 仍是额度耗尽 code。

## 保留的 Web 侧接口

桌面壳加载本仓库的 web 前端，因此其接口的 web 侧一半保留，并作为普通 web 接口继续演进：`packages/client/web` 的 window-drag 模块与 `data-window-drag` 标记，以及 shortcuts 与 boot 路径读取的 `qilinDesktop` / `__QILIN_SHORTCUTS_CONFIG__` 全局接口。设置中的桌面更新 bridge 与指示器不属于此集合：该流程只为合并前壳的更新器存在，已随其移除。

## 已考虑的替代方案

**在上游账号栈与 ui-account 之外再移植上游账号栈。** 否决：一个浏览器产品背后有两套账号面，会重复登录、凭据与设置状态。自有 ui-account 设计是已交付的面；上游栈在这里没有 owner。

## 后果

账号面保持单一：ui-account 于 `/api/auth` 之后。桌面壳决策现由[合并笔记](2026-10-09-openkylin-desktop-merged-into-qilin.zh.md)承载。
