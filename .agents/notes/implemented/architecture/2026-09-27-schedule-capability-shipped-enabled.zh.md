# Agent Note：随发行版交付的 Web 配置启用定时任务能力

Status: implemented

[English](2026-09-27-schedule-capability-shipped-enabled.md) | 中文

## Problem

持久化的定时任务在本仓早已存在，它是分散在三行里的同一个能力：`@qilin/schedule` 拥有任务存储，并把每次到点触发作为后续消息投递回它原本的会话；`@qilin/time-context` 提供当前时间、浏览器时区与已用时长，模型据此解析「明天九点」这类未限定时间；`@qilin/client-ui-schedule` 是浏览器半，负责列出、编辑与呈现这些任务。`packages/bundle/web-app/cordis.patch.yml` 却把三行都以 `disabled: true` 出厂，于是 QiLin 的 Web 配置携带了一个完整、有测试、却无法抵达的功能：侧边栏入口、任务目录与三个宿主动词都没有打开的办法。上游默认值编码的价值是「定时任务按部署选择启用」，而它无法被触达的原因纯属机制——插件管理页按设计排除内置 profile 组合包，因此没有任何产品内页面能翻转由 `@qilin/web-app` 拥有的行。

## Decision

web-app 组合包启用这三行，仅此而已：不新增包、不建第二个任务存储、不做平行的浏览器面。三行作为一个整体启用，因为任何单独一行都留下残缺形状——服务没有时间上下文就无法解析「明天九点」，浏览器半没有服务就无数据可读。

承担这件事的层是 `packages/bundle/web-app/cordis.patch.yml`，因为它就是发行版真正启动的那个 profile：它组合出产品的默认插件集，而想要关闭定时任务的部署在那里或更晚的 overlay 里禁用这些行。`apps/web/tests/schedule-panel.e2e.ts` 启动真实组合，断言侧边栏条目、任务目录与无 page error，因此某行不再激活时失败发生在组装产品的泳道里，而不是在用手搭席位写成的单测里。`apps/cli/tests/profiles/web/tests/web-default-isolation.expected.e2e.ts` 从另一侧钉住出厂默认：两个宿主行动作状态为 active，浏览器半行出现在客户端图中。

## Consequences

- QiLin 的 Web 配置从此开箱即可回应「两小时后提醒我」与「每个工作日九点」；任务落在提出要求的那个会话里，跨重启保留，并从侧边栏「自动化任务」入口可见。
- 上游默认值承载的「按需启用」价值转移到 overlay 层：关闭定时任务是一次部署编辑，而不是用户操作，组合包注释在该行说明了这一点。
- `docs/subsystems/schedule.md` 仍是该能力的归属文档；本次 profile 变更不新增任何服务、事件或持久化词汇。
- profile 默认现在被断言两次——一次在 profile 名册黄金里，一次在组装后的浏览器里——因此这个能力的任一半静默失效都会是一道红门禁，而不是菜单里少一项。

## Alternatives considered

**另外移植一个自动化插件，自带持久记录与全新会话执行。** 拒绝：它重复了引擎已经交付的能力，却语义不同（每次运行开新的根会话，而不是在提出要求的会话里投递后续消息），同一个概念拥有两套持久化词汇，并且同一个面向用户的任务会有第二个侧边栏条目。`@qilin/schedule` 当初被移植进来正是为了这个目的，且已有自己的执行器、投递历史与投递 e2e 测试覆盖。

**保持这三行禁用，改为把开启它们的 overlay 写进文档。** 拒绝：出厂 profile 就是产品，一个需要手写 overlay 才出现的功能不算已交付。上游「让定时任务按需启用」的理由改由「可用 overlay 关闭」来保留。

**只启用 `time-context` 或只启用 `ui-schedule`。** 拒绝：这三行是同一个能力。没有时间上下文的服务会拒绝自然语言日期，没有服务的浏览器半会渲染出一个无法填充的空目录。
