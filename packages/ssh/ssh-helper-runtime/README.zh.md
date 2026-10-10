---
description: "将 POSIX SSH 辅助程序构建为自带 Node 运行时的独立可执行文件，使远端主机无需安装 Node。"
kind: "package-library"
---

# @qilin-agent/ssh-helper-runtime

[English](README.md) | 中文

## 概述

这个私有载体把 SSH 辅助程序、受管子进程 runner 与内嵌 PTC worker 打成一份可执行归档，远端主机因此无需安装 Node 或工作区包即可运行它们。`runSshHelperRuntime` 是唯一入口：它断言 SEA 引导形态、把原生包指向与之同置的目录，然后只分发到三者之一。连接配置仍在 [`qilin-ssh`](../ssh/README.zh.md)。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本载体是私有工作区包：它既不是 profile 插件，也不暴露 npm CLI。它的分发单位是一份可执行归档，内含可执行文件、与其同置的 `native/system/` 目录以及完整性元数据；部署时把整份归档解到带版本号的运行时位置，而不是替换临时挂载点。

在 [`qilin-ssh`](../ssh/README.zh.md) 中以 `launch: { kind: "executable" }` 配置远端连接，并给出 `helper` 的绝对路径与其 SHA-256。连接通过 `ctx.ssh.ptcLaunch` 取得内嵌 PTC 调用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

引导只在打包后的可执行文件内运行，因此入口拒绝普通的 `node` 调用。其余设计由两项事实决定：操作系统必须从真实文件执行 Landlock 启动器与 PTY 启动器；平台原生包在运行时按包说明符解析。一个进程内的解析钩子把 `@qilin-agent/node-addon-system-<platform>-<arch>/package.json` 映射到可执行文件旁的 `native/system/package.json`，这正是该目录必须随其分发的原因；node-pty 沿用其相对可执行文件的 spawn-helper 约定。

分发逻辑在导入任何模块之前读取私有选择子，随后将其删除。`QILIN_PTC_RUNTIME_NODE=1` 导入 PTC Node worker；存在 `QILIN_SUBPROCESS_RUNNER` 时导入受管子进程 runner 并把选择子交给它；两者皆无时导入 SSH 辅助程序。runner 入口声明其选择子送达时已被删除，因此该删除由引导负责。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [SSH 连接](../ssh/README.zh.md)——认证、调用与生命周期。
- [PTC Node 运行时](../../ptc-runtime/ptc-runtime-node/README.zh.md)——显式 worker 启动与执行上限。
- [SSH 子系统](../../../docs/subsystems/ssh.zh.md)——远端执行坐标。

-----

<a id="model-experience"></a>
## 模型体验

无：该私有进程载体不注册任何面向模型的工具或提示词内容，其结果由消费方负责呈现。

#### KV Cache 影响

本载体不添加任何请求前缀内容。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 仓库内尚无本载体的归档构建器与产物验证器，因此在它们出现前无法从检出目录实跑。
- Windows 与基于 musl 的 Linux 不是构建目标。沙箱可用性仍取决于目标内核与系统工具。
- 该可执行文件接受私有 worker 调用，而非任意 Node CLI 参数。项目 `node` 命令与嵌套的 JavaScript 子进程仍需各自的 Node 安装。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>供维护者参考的工作上下文——点击展开</summary>

</details>
