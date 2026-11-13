---
description: "无依赖的 HarnessError 基类，携带稳定且可机器路由的 code，供彼此不能互相依赖的能力包共用。"
kind: "package-library"
---

# @qilin-agent/util-error

[English](README.md) | 中文

## 概述

`qilin-util-error` 为所有 harness 包提供同一个错误基类。`HarnessError` 携带稳定、可机器路由的 `code` 与人类可读的 `message` 分开，保留链式 `cause`，并以子类构造函数名作为 `name`。它不导入任何东西，因此即便 `@qilin-agent/llm` 依赖 `@qilin-agent/attachment`，两者仍共用这个类。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在拥有该失败分类的包中继承它：

```ts
import { HarnessError } from '@qilin-agent/util-error'

type AttachmentErrorCode = 'ATTACHMENT_MISSING' | 'ATTACHMENT_TOO_LARGE'

class AttachmentError extends HarnessError {
  constructor(message: string, code: AttachmentErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'AttachmentError'
  }
}
```

按 `code` 路由，绝不要解析 `message`。工具执行会把抛出的 `HarnessError` 投影为 `{ name, code }`，模型请求失败也会保留该类的 code，而不是退化成 `UNKNOWN`。

<a id="understand-the-implementation"></a>
## 理解实现

`HarnessError` 不持有模块状态、注册表或构造函数表：它只给 `Error` 增加一个 `code` 字符串并转发 `ErrorOptions`。`name` 取自 `new.target.name`，因此每个子类保留自己的名字，同时在运行时边界共享同一个基类身份。

### 源码地图

| 文件 | 内容 |
|---|---|
| [`src/index.ts`](src/index.ts) | `HarnessError` |

<a id="further-exploration"></a>
## 进一步探索

- [`@qilin-agent/llm`](../../llm/llm/README.zh.md) 保留 `LlmError` 分类体系与提供方无关 code，并再导出本基类。
- [`@qilin-agent/attachment`](../../attachment/attachment/README.zh.md) 拥有 `AttachmentError` 及其稳定 code。
- [`@qilin-agent/tools`](../../core/tools/README.zh.md) 把 `{ name, code }` 投影到工具结果。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **`instanceof` 只认一个安装副本。** 同时安装两份本包的 profile 会持有两个不同的类；工作区只链接一份，跨宿主边界时调用方传递 `{ name, code }`，不依赖原型身份。
- **code 是开放字符串。** 这里没有封闭联合类型；每个 seam 拥有自己的 code 集合，消费方必须容忍未知 code。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

`HarnessError` 放在这个叶子包里而不是 `@qilin-agent/llm`，因为 `llm` 依赖 `@qilin-agent/attachment`，而 `AttachmentError` 必须继承同一个基类。保持无依赖：在本包引入任何导入都会重新制造这个包要消除的循环。

</details>
