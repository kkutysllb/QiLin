---
description: "Web 设置中的技能页面：把当前会话组成解析出的技能目录按发现来源分组展示。"
kind: "package-reference"
---

# @qilin/client-ui-settings-skills

[English](README.md) | 中文

## 概述

技能页面是设置中的一个分区。它列出当前会话可用的全部技能——名称、路由描述、调用策略、发现来源与持有正文的提供方——并按每个技能的发现位置分组。页面读取的是组合器 `/` 菜单已在使用的、按会话寻址的 `skills/list` Remote，自身不提供任何变更：技能因存在于某个被发现的根目录而可用，页面只做刷新，不提供无法生效的编辑。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打开**设置 → 技能**。页面寻址窗口当前显示的会话并列出它的目录；切换到另一个会话会重新读取。

### 分组

| 分组 | 发现来源 |
|---|---|
| 插件提供 | `runtime`、`bundled` |
| 工作区 | `project-qilin`、`project-agents` |
| 用户目录 | `user-qilin`、`user-agents` |
| 自定义根目录 | `custom`，以及部署自行添加的来源 |

页面不认识的来源会落到**自定义根目录**，而不是消失：页面报告的是组成真正解析出的结果，而不是它认得的一份根目录白名单。

### 行内容

每行包含技能名、描述、可选的 `whenToUse` 指引、模型是否同样可以调用、发现来源，以及持有正文的提供方。同名冲突中落败的排名不会列出——表格展示每个名字的胜出技能，也就是一次调用真正解析到的那个。

### 会话尚不存在时

目录是会话自身的组成，因此在没有打开会话时页面不向宿主索取任何内容，而是明确说明这一点，而不是显示一个会被读成「没有安装任何技能」的空目录。预设解析不出任何技能的会话会单独报告这一情况。

<a id="understand-the-implementation"></a>
## 理解实现

`SkillsStore` 持有页面快照——状态、错误、被寻址的会话、行——以及它背后的取消规则：被更新的一次读取取代的读取永不发布，关闭会话会用空状态取代仍在途的读取。`SkillsSection` 通过注入的 `useSnapshot` 钩子渲染该快照，按上表固定分组，并在当前会话变化时重新读取。会话 id 来自共享的 `useSessions` 座位，在会话列表报告就绪之前一律读作「没有会话」。

<a id="further-exploration"></a>
## 进一步探索

- [技能提供方注册表](../../skill/skill/README.zh.md)——本页面渲染其合并目录的 Service Definition。
- [本地文件系统提供方](../../skill/skill-filesystem/README.zh.md)——分组背后的根目录、排名与来源名称。

<a id="model-experience"></a>
## 模型体验

None, as this page reads the Session-addressed skills Remote and contributes no prompt text, tool, or session event of its own.

#### KV Cache effect

本身没有。页面列出的技能由会话自身的组成对外声明；页面既不向请求添加内容，也不读取任何缓存前缀。
## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制描述本页面做不到什么、以及什么时候需要留意。它们是当前约束，不是与其他技能管理器之间的对比，也不是任务清单。

- **没有正文预览**——目录只携带摘要而不携带正文，因此页面展示发现来源与持有正文的提供方，而不是指令文本；读取正文需要一次按名字寻址、且只服务最近一次枚举命中的读取，推迟到有消费方需要时再做。
- **没有启用或编辑操作**——技能因存在于被发现的根目录、或由插件注册而启用，两者都不是设置文档；页面只刷新，不提供无法生效的写入。
- **只显示被寻址会话的目录**——预设各自组装自己的技能层，因此页面展示当前打开的会话解析出的内容，而不是所有预设的并集。
- **没有覆盖本页面的浏览器级端到端断言**——随包发布的用例以桩 props 驱动 store 与分区，装配面的检查目前是手工的。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：尚未决定的开放问题与方向。它明确不具备权威性——已发布行为、限制与已接受的取舍见上文各节、包代码以及链接的 Agent Note。

- 页面是否应提供「把未注册的技能拷进 `~/.qilin/skills`」仍待定；它需要一个未注册技能的来源池，而目前的 QiLin 部署并不分发这样的池子。
- 逐技能读取正文还能支撑「胜出技能与被高排名遮蔽的技能之间的差异」这类展示；目前没有消费方提出需求。

</details>

**Runtime invariant:** 不发布伴生包。本页面仅有的关系是它自己的快照与注入的 slot 面，对它们不存在会各自漂移的独立观测。
