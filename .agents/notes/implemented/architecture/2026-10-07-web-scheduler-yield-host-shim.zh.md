# Agent Note: 宿主入口的 Web Scheduler API 兜底

Status: implemented

[English](2026-10-07-web-scheduler-yield-host-shim.md) | 中文

## Problem

dsh 0.2.1-alpha.1 的移植带来了一批协作式让路路径，它们调用 Web Scheduler API：`@qilin-agent/api-session-controller` 的冷会话列表，以及 `@qilin-agent/session-persistence-jsonl` 的分片让路。若按裸全局读取，承载本 harness 的两个宿主都没有 `scheduler`——Node 24.18.0 不定义该全局，而 `node:timers/promises` 有导出；Electron 44 内置的是 Node 24——由此产生的 `ReferenceError` 落在 RPC 网关内部：整个网关失效，而不是单次调用失败，桌面壳表现为历史会话为空。

## Decision

两个宿主入口在宿主未提供 `scheduler` 时安装 `globalThis.scheduler.yield` 兜底。TypeScript 的那份在 `apps/cli/src/scheduler-yield.ts`，由 `apps/cli/src/bin.ts` 在入口顶部、任何模式模块导入之前调用，因此覆盖全部调用模式（`profile`、`plugin`、`tenants`、`dump-config`）。`desktop/package/app/host/main.mjs` 自带一份，因为以 Electron 作为 Node 的宿主无法导入该 TypeScript 模块。兜底在下一个 `setImmediate` 上兑现——即该 API「让出事件循环一次后继续」的语义——宿主自带的 `scheduler` 一律不被覆盖。

三处调用点已不再依赖它：各自从 `node:timers/promises` 导入 `scheduler`，所有受支持的宿主解释器都提供该导出（`@types/node` 把它的起点记为 Node 17.3.0）。这个兜底是给进程内其余代码的宿主能力保证——从上游移植的模块，以及加载进同一宿主的第三方插件。

## Alternatives considered

**要求宿主定义该全局。** 否决：`engines` 范围（`^22.19.0 || >=24.0.0`）与桌面壳实际使用的运行时（Electron 44 内置的 Node 24）由本仓的使用方选择，不由本仓决定。

**撤掉兜底，只依赖调用点的模块导入。** 否决：那三处导入保证的是 harness 自身正确，而这个兜底防的是进程级失效，可能读取该全局的代码包含本仓并不分发的部分——从上游移植的模块，或插件管理器加载进来的第三方插件。没有任何静态检查能枚举它们，而这个保证的代价只是一个基于 `setImmediate` 的方法。

**依赖已发布的 `scheduler` 兜底包。** 否决：用到的面只有一个方法、语义已有文档，而任何此类包仍必须在读取该全局的模块求值之前完成安装，这正是当前安装发生的入口位置。

## Consequences

该全局在每个 `qilin` 调用模式与桌面宿主进程中都存在；自带 `scheduler` 的宿主保留自己的实现，重复安装是空操作。在受支持的 Node 上运行 harness 无法暴露「缺少该全局」，因为本仓分发的代码都不再读它——覆盖由 `apps/cli/tests/scheduler-yield.spec.ts` 提供：它钉住兜底会越过微任务队列让路、宿主自带的 `scheduler` 得以保留、以及安装是幂等的。当 harness 与它加载的插件都不再裸读该全局时，这两份副本一并移除。
