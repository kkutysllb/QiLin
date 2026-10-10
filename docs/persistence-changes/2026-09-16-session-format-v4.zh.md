---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-16-session-format-v4

[English](2026-09-16-session-format-v4.md) | 中文

## 概述

将 已定稿 V4 写入方声明的 SessionHeader.version 从 3 推进到 4，记录一等 tool 角色结果与生产者拥有的 source，并向 turn/end.reason 添加 forked 变体。 添加 developer 角色的 Session 变更，工具添加仅记录名称并绑定历史请求头，另含工具移除和延迟加载模式标记。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-16-session-format-v4
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "d720be5aedaf6d8b499d467d6e03f98b0dfcdc4f0da95373985e290f9cb3e136"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-14-image-offload"
    after: "6d7bb8945b1e5f8620a0f28d8a69d6cd247660c2ae6d206a8e5170f72dae0f20"
    decision: version-bump
  - root: "event:assistant/attempt"
    previous: "2026-09-14-image-offload"
    after: "3391199b615a3894a26212960f4a90350bcbdb2c0e504b2dc96548e1aa166466"
    decision: version-bump
  - root: "event:assistant/message"
    previous: "2026-09-14-image-offload"
    after: "525c28020c0927822a4739bdc5c45db2e29e1f5b7610667f5548b989e0c67b51"
    decision: version-bump
  - root: "event:compaction/summary"
    previous: "2026-09-14-image-offload"
    after: "e9a96852fab5c19342b80eaad9206540bfc0b9de9199ab9e3a2306e0cb671f0a"
    decision: version-bump
  - root: "event:developer/message"
    previous: null
    after: "92117940b84e5e29e4e4d8dd58f6dc191853a43d59f3e4337a5dd4a49f0cc460"
    decision: version-bump
  - root: "event:request/header"
    previous: "2026-09-11-initial"
    after: "e00a308b34eb536c318879aaddfa38f27c434995735ab1c58eab784ea4b5bd36"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-09-14-image-offload"
    after: "5f5dbdcc172f780f31d7017fd78bc7f96b2882abcae62e0fd6ea9f507f2b48f1"
    decision: version-bump
  - root: "event:system/message"
    previous: "2026-09-14-image-offload"
    after: "23efb2a10dc8eca78577f2a053b13428b1939e147d6041ea27e4634ac5e6bf6f"
    decision: version-bump
  - root: "event:team/message/queued"
    previous: "2026-09-14-image-offload"
    after: "24e955ab9d60476bfe12e020778b49a98d55d92239699f65b2b7db6901f6d891"
    decision: version-bump
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-14-image-offload"
    after: "ab8968660be6347aede1bf83706e921cd836a16a77e8b1627672044cd76e7239"
    decision: version-bump
  - root: "event:tool/result"
    previous: "2026-09-14-image-offload"
    after: "83abeec3277753cb702296a3497f61047eb17dcb20e5c809cafc473d2279720e"
    decision: version-bump
  - root: "event:turn/end"
    previous: "2026-09-14-image-offload"
    after: "4e75896cec18fef7578ee36658dc6f53b58eb455c298fbd2cc531f87ca13d484"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-09-14-image-offload"
    after: "c3476ce746996e6fb7a281fe5920a4df3298a8a597fff19490fbd43641f1b870"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

工具角色声明会改变十个事件根，因为 inbox 条目、消息事件、compaction 摘要、标题请求、团队消息和 PTC dispatch 嵌入了共享的 `Message` 或 `ContentBlock` 声明。从联合中移除 `tool-result` 并按角色细化消息，会改变这些可达 schema，并非新增十套独立事件协议。`turn/end` 的变更单独记录 forked reason；`SessionHeader` 记录版本递增。

[原生 V4 校验决策](../../.agents/notes/implemented/architecture/2026-09-17-native-v4-read-validation.zh.md) 负责说明这些当前字段所需的读取接纳规则。

V3-to-V4 迁移将已发布的 user 角色工具结果提升为 tool 角色消息，包含必需的 toolCallId 和可选的 isError。工具结果包装不再属于内容块联合。迁移保留每个已接纳源事件和继承切分点，并根据同一持久化根目录中保留的直属子 Session 日志追加缺失的父级 subagent/catalog 记录。历史正文恢复要求显式提供子日志证据集合；没有可供补全的子日志时也须传入空集合。子日志的 descriptor 缺失、多条或版本未知时，跳过该子项的补全；身份、时间戳或模式冲突会拒绝迁移且不发布后继。已有 catalog 事实保持不变。历史读取打开在内存中准备结果。写入打开在重新校验子项成员与修订后，将当前后继发布到未修改的前代文件旁。Delivery generation 校验防止历史确认成为有效的 V4 水位。V3 读取方拒绝更新的 generation。已定稿迁移向 turn/end.reason 添加 forked。精确切点的 fork 在继承标记之后追加子会话自有的错误结果和结束事件。V4 接纳经过校验、使用确定性分支 ID 和文案的未启动 fork 结果；已发布的 V0–V3 校验器和已记录的前驱代际保持不变。

`request/header` schema 还将退役的 `system` 键记录为禁止字段。这项声明记录已有的原生读取拒绝规则，不改变存储数据或提示词重建；以后允许该字段携带值时，必须提升格式版本，而不能归类为普通可选字段添加。

生产者拥有的 source 通过 [V3→V4 迁移](../../packages/session/session-format-v3-to-v4/README.zh.md#v3-to-v4-specification)替代已发布的 plugin wrapper。冻结的重命名表和冲突规则保留 source 字段与事件坐标；未知生产者归属保留每个自有 JSON 属性。原生读取和写入打开在公开 Session 之前校验 source 字段。已有 V4 文件不会重新运行迁入边。

核心拥有的 user source 属性记录归属保留策略；tmux-context 将位置归属标记为符合条件，同时保留生产者内部的去重。Auto Review 和压缩摘要器使用仅供请求使用的 user 输入，移除其活动 source 注册，同时保留历史迁移支持。这些输入不能写为持久化 Session 消息。目录 formatVersion 2 保存策略元数据，不改变 Session 版本，也不重写冻结的 schema 记录。System、model 和 tool source 保持严格的语义规则。

Developer 事件保留原始角色，并要求处于打开的 step。每个添加块存储 toolName；developer/message.headerSeq 指向更早且已知的 request/header，其中必须恰好包含一个完整同名 ToolSchema。同一事件的所有添加共用该历史请求头版本，仅移除或其他 developer 消息省略 headerSeq。原生与 Session 接纳拒绝缺失、前向、非请求头、未知请求头、歧义、不完整定义及已退役内嵌定义形式，不解释未知且可忽略的记录，也不丢弃无关 JSON 元数据。同名替换、重启、fork、surface 替换和压缩保留历史模式身份，不查询最新请求头或注册表。通用 sourceEventSeqs 保持独立。Developer source 使用与 user source 相同的已记录归属保留策略。可选的 deferLoading 标记独立于添加历史。已提供的 profile 不发出 developer 记录；提供方序列化、自动发出及 UI 支持仍未启用。

PTC 生产者写入 `source.kind: 'ptc-mode'`。V3→V4 迁入边保留 `tools-code-mode` 和 `tools-ptc` 作为历史 plugin 查找键，并将二者映射到该当前 kind。source 策略保留 `ptc-mode`，不允许将其声明为仅用于归属。

<a id="verification"></a>
## 验证

精确切点 fork 集成后，聚焦的 Session、agent-loop、Session Controller、V4、chat-view 和 compaction 测试共 63 个文件、1,523 个测试通过。V4 fork 测试确认编码、解码和恢复保留原始 ID 与文本，拒绝格式错误的结果，并验证嵌套继承切点。工具角色迁移测试和 SDK 快照刷新也在原始变更中通过；构建后的 Python runtime sdk-snapshot 场景通过，定向 pi-ai 与 auto-review 覆盖率检查通过 351 个测试，三个受影响模块覆盖率均为 100%。

生成的请求头保留字段回归测试以及已有的退役语法和 Session surface 测试共通过三个文件中的 65 项测试。生成字段保留可选的 `never`；允许可选字符串会产生必须提升版本的诊断，而原生读取方仍拒绝该退役键。

Producer-source 与 request-input 检查共通过 12 个文件中的 447 项测试，覆盖 provider 等价性、仅供请求使用的输入的类型拒绝、user 归属保留、source 迁移及原生 source 准入。与 tool-role 父层的生成目录相比，有四个 root 发生变化，447 个类型指纹保持不变。

聚焦的 Session、V4 和 request-input 测试共 38 个文件、884 项通过，完整 V3-to-V4 包与 Session surface 的语句、分支、函数及行覆盖率均为 100%。覆盖历史同名模式绑定、复合添加/移除、畸形引用与定义、未知请求头拒绝、未知记录不透明性、元数据保留、fork、替换、压缩引用，以及不重写 generation 的原生 plain/zstd 读写接纳。

<a id="dev-note"></a>
## 开发备注

无。
