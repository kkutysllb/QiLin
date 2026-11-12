# Agent Note: 消息标题默认使用黑体字族

Status: implemented

[English](2026-11-12-heiti-heading-face.md) | 中文

## Problem

内容排版阶梯把每个 Markdown 标题（h1–h4）与会话首页大标题都挂在 `--qilin-font-family-heading` 上，而该变量的默认值是系统宋体族（Songti SC 等）。因此消息标题与黑体正文呈现为两种字形。Owner 要求消息渲染默认改用黑体，让会话区域读起来是同一个无衬线表面。

## Decision

`packages/client/ui-theme/src/styles/base.css` 中的 `--qilin-font-family-heading` 默认改为系统黑体栈：`PingFang SC`、`Hiragino Sans GB`、`Noto Sans SC`、`Source Han Sans SC`、`Source Han Sans CN`、`Microsoft YaHei`，最后是拉丁无衬线兜底。`gradient-shadow-text.css` 的 Markdown 阶梯与 `HeroShell.module.css` 继续消费这一个变量，字号与字重层级不变。

正文（`--qilin-font-family-text-default`）、代码与侧栏终端保持原有字族，可配置字体角色仍是 `text`、`code`、`terminal`。该变量仍是唯一覆盖点：需要展示字体的部署只改 `--qilin-font-family-heading`，不必碰排版阶梯。

品牌落地页与登录页保留各自的衬线变量（`--font-serif`、`--ql-font-serif`）；它们是消息渲染之外的营销页面。`docs/web-styling.md` 及中文对应文声明黑体默认值，并把标题字族归属留在主题所有者。

## Alternatives considered

**保留宋体并增加一个标题字体设置行。** 可选的标题字体是第四个字体角色，需要独立的 schema 字段、持久化、本地化文案与测试面，而 Owner 已经定了这个偏好；CSS 变量本身已给部署留出覆盖能力。

**把标题并入正文字族并删除该变量。** 这样 `gradient-shadow-text.css` 与 `HeroShell.module.css` 会各自硬编码正文字族，部署也没有单一位置给标题换展示字体。

**反过来把正文改成衬线。** 方向相反：要求是消息渲染用黑体，而正文字族同时驱动界面外壳与所有工具行。

## Consequences

消息标题现在与正文共享中日韩字形与笔画粗细，层级依靠字号与字重而不是换字族。纸感色板、收窄的圆角标尺与阅读纸面不变。恢复衬线默认只需改一个变量；今天想要衬线的部署在自己的样式表里设置即可。

没有已存储偏好、会话字段或渲染快照断言标题字族，因此既有会话与设置无需迁移。
