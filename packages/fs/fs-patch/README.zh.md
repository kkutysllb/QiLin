---
description: "在不访问文件系统的前提下解析 Codex 风格补丁，并把 hunk 应用到文本。"
kind: "package-reference"
---

# @qilin-agent/fs-patch

[English](README.md) | 中文

## 概述

用 `parsePatch` 把完整的 Codex 风格补丁解析为有序的文件操作，再用 `applyHunks` 把更新 hunk 应用到 LF 规范化的文本。两个函数都只处理调用方传入的字符串，不访问文件系统。语法错误会抛出并带原始输入行号；匹配返回新文本或结构化失败。

## 目录

- [使用本包](#use-this-package)
- [兼容性](#compatibility)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

操作与 hunk 只含可 JSON 序列化的值；解析保留重复路径在输入中的顺序，且不做路径解析。

```ts
import { applyHunks, parsePatch } from '@qilin-agent/fs-patch'

const operations = parsePatch('*** Begin Patch\n*** Update File: hello.txt\n-hello\n+hi\n*** End Patch')
const operation = operations[0]
if (operation?.kind === 'update') {
  const result = applyHunks('hello\n', operation.hunks) // { ok: true, after: 'hi\n' }
}
```

格式错误的输入抛出 `PatchParseError`，带从 1 起算的 `lineNumber` 与可据以修正的 `reason`。定位会把原始输入中的前导空行与 heredoc 包裹计入行号。

`applyHunks` 返回 `{ ok: true, after }` 或 `{ ok: false, failure }`，且不修改入参。匹配失败会报告 hunk 的补丁行号、`context` 或 `oldLines` 阶段、顺序搜索游标，以及原始未匹配模式；尾部空行重试仍报告原始模式。以返回值而非抛出报告失败，便于调用方跨文件操作汇总匹配失败。

<a id="compatibility"></a>
## 兼容性

参照实现是 [OpenAI Codex rust-v0.158.0](https://github.com/openai/codex/tree/rust-v0.158.0/codex-rs/apply-patch/src)：语法取 `parser.rs` 与 `streaming_parser.rs`，匹配与 `NormalizeToLf` 重建取 `seek_sequence.rs` 与 `file_update.rs`；`text_file.rs` 记录了另一套保留行的表示。 [解析测试](tests/parse.spec.ts) 与 [文本测试](tests/apply.spec.ts) 改编了部分上游用例，含 `file_update_tests.rs` 与 `lib.rs`。[LICENSE](LICENSE) 在 QiLin 的 MIT 许可之外保留 OpenAI 署名与 Apache-2.0 条款。

### 解析

| 输入 | 解析结果 |
|---|---|
| Begin/End Patch；Add/Delete/Update File 头 | 有序操作；空补丁与空的 added 文件都被接受。 |
| 以 `+` 前缀的 added 文件行 | 去掉前缀；每行贡献一个末尾 LF。 |
| 以空格、`+` 或 `-` 前缀的更新行 | 上下文、插入或删除；裸空行是空上下文。 |
| 首个不带 `@@` 的更新；后续 `@@` 或 `@@ text` | 有序 hunk，可带上下文锚点；空 hunk 被拒绝。 |
| Update File 之后紧跟 Move to | 目标写到该更新上；没有非空 hunk 的移动被拒绝。 |
| hunk 之后的 End of File | EOF 标记；其后的空行被忽略，再出现内容必须是新 hunk 或文件头。 |
| LF/CRLF、外层 Unicode 空白、缩进的头 | Codex 的裁剪规则使用 Unicode `White_Space`（含 U+0085，不含 BOM U+FEFF）。更新内部的缩进标记仍是上下文。内容空白保留。 |
| 字面 `<<EOF`、`<<'EOF'` 或 `<<"EOF"` 包裹 | 接受且不做 shell 求值；结束行必须以 `EOF` 结尾，与参照实现一致。 |
| 重复路径、相对/绝对路径、Unicode 文本 | 原样保留，不做路径解析或 Unicode 规范化。 |
| Environment ID 头 | 在首个操作之前给出专用的不支持错误；其余位置按普通语法错误处理。 |
| unified diff、shell 命令、畸形标记 | 以原始行号拒绝；诊断措辞与 Codex 不同。 |

与参照实现一致，任何 hunk 之前的 EOF 不产生效果；更新仍要求至少一个非空 hunk。参照实现还接受在较早的 End Patch 与中间空白之后多余的末尾 End Patch。

### 匹配与文本更新

| 输入或规则 | 结果 |
|---|---|
| 四轮匹配 | 精确、两侧去尾部 `White_Space`、两侧都去空白，再到去空白后把 Unicode 标点映射为 ASCII。每一轮都先搜完所有候选，再进入下一轮。 |
| Unicode 标点 | U+2010–2015 与 U+2212 映射为 `-`；U+2018–201B 映射为单引号；U+201C–201F 映射为双引号；U+00A0、U+2002–200A、U+202F、U+205F 与 U+3000 映射为空格。不做 NFC/NFKC 规范化。 |
| `@@ text` 与重复内容 | 从游标起找到第一个匹配的锚点，再在其后搜索。旧行取该游标起的首个匹配，并把游标推进到匹配末尾。所有搜索都基于原始文本。 |
| EOF hunk | 只在 `lineCount - patternLength` 处搜索，即使该位置在游标之前。钉定的实现不会回退到更早的匹配，尽管其搜索函数的注释如此暗示。 |
| 空旧行 | 插入到原始文件末尾；若存在末尾空源行，则插在它之前。插入不推进游标；锚点仍须匹配。同一位置的插入保持补丁顺序。 |
| 以空行结尾却未匹配的模式 | 去掉最后一行重试；若新行最后一行为空也一并去掉。重试后为空的模式匹配游标。 |
| 重建 | 匹配前先去掉一个末尾的空 split 元素；按起点稳定排序后倒序应用替换。若末尾没有空元素则补一个，再用 LF 连接。空输出保持为空；非空输出以 LF 结尾。 |
| 上下文行 | 按补丁文本替换整段匹配区域，包括被容忍的上下文差异。 |
| 没有 hunk | 仍执行同一套重建，因此缺末尾 LF 会被补上，且可能吃掉一个末尾空行。 |

与 Codex 的有意差异在于职责归属与结果报告：QiLin 的 provider 保留行尾风格，因此匹配器只看到 LF 规范化后的文本，也没有实现 `PreserveLineEndings`。CR 是普通字符：调用方必须先规范化 CRLF，写出后再恢复所选风格。匹配失败返回结构化数据而不是 Codex 那种带路径的错误，因此文件标识与面向用户的诊断归调用方所有。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[解析器](src/parse.ts) 构造语法记录，不依赖 Session 或 provider。[文本更新器](src/apply.ts) 在构造完整结果之前先在原始文本上定位每个 hunk。[类型](src/types.ts) 承载语法位置与匹配失败。[文件系统子系统](../../../docs/subsystems/filesystem.zh.md) 说明 provider 如何消费这些记录。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [文件系统包组](../README.zh.md) —— provider、策略与文件工具。

<a id="model-experience"></a>
## 模型体验

### 补丁匹配诊断

#### 模型看到的内容

没有直接影响：本库不注册任何提示词、工具 schema 或结果文本。`qilin-tool-fs` 把它的结构化失败渲染进 `FS_PATCH_MISMATCH` 诊断，写明补丁行号、`context` 或 `oldLines` 阶段，以及未匹配的模式。

#### Token 影响

本库自身没有；由调用方决定把多少解析结果与失败信息放进请求。

#### KV Cache 影响

不会直接使缓存失效；渲染该诊断的工具负责请求前缀的任何变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 文本更新只实现 `NormalizeToLf`；行尾转换由调用方负责。
- 公共 API 接受完整字符串，不接受流式增量。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
