# Agent Note: 桌面壳与上游账号栈边界

Status: implemented

[English](2026-09-25-desktop-and-account-alignment-boundaries.md) | 中文

## 问题

本 fork 携带了上游桌面壳（Electron 应用及其私有 Node 模式 host），并保留了上游账号栈的预备代码。两者都与本 fork 的产品形态冲突：QiLin 桌面端是独立项目，账号面是 QiLin 自有的 ui-account 设计。没有记录在案的边界，上游桌面与账号提交就会不断诱发本仓库不应接受的移植。

## 决策

桌面壳目录已从本仓库删除，连同其打包、签名、更新与发布工具链、仅桌面消费的设置更新面，以及第三方声明生成中的桌面运行时锁输入。上游桌面端变更一律不移植。`desktop` profile 名仍为独立 QiLin 桌面应用保留，公开 CLI 拒绝 `--profile desktop`，不管理其文件。

账号栈边界同理：QiLin 账号面为自有 ui-account 包及其 `/api/auth` gate。上游 deepseek-account 栈——账号服务、deepseek 账号 LLM provider、账号设置 UI 及其配额 UI——一律不移植。为该栈预留的 llm 核心账号额度失败 code 已删除；提供方中立的 `QUOTA` 仍是额度耗尽 code。

## 保留的 Web 侧接口

桌面壳加载本仓库的 web 前端，因此其接口的 web 侧一半保留，并作为普通 web 接口继续演进：`packages/client/web` 的 window-drag 模块与 `data-window-drag` 标记，以及 shortcuts 与 boot 路径读取的 `qilinDesktop` / `__QILIN_SHORTCUTS_CONFIG__` 全局接口。保留原因是独立桌面项目会针对本仓库交付的 web 构建消费这些接口；删除它们会迫使该项目 fork 前端。设置中的桌面更新 bridge 与指示器不属于此集合：该流程只为已删除壳的更新器存在，已随其移除。

## 已考虑的替代方案

**保留桌面壳直至独立项目达到同等能力。** 否决：本仓库既不构建也不发布桌面产品，壳在这里没有消费方，而每一处引用——tsconfig 聚合、工作区构建列表、release families、第三方声明、client i18n 扫描——都在支付维护成本。

**在上游账号栈与 ui-account 之外再移植上游账号栈。** 否决：一个浏览器产品背后有两套账号面，会重复登录、凭据与设置状态。自有 ui-account 设计是已交付的面；上游栈在这里没有 owner。

**随壳一起删除 window-drag 与 `qilinDesktop` 接口。** 否决：它们是存续 web 构建对外部桌面项目兑现的契约，不是壳的实现。

## 后果

全仓对桌面树的引用已清零；关于桌面打包、更新与安装器的冻结 Agent Note 已移入归档，其路径描述的是已删除的树。消费壳 preload 桥的验收覆盖、以及行使已删除 host 的 workspace-dependencies 插件的录制覆盖，随其主体一并移除；该验收由独立桌面项目在其仓库内承担。
