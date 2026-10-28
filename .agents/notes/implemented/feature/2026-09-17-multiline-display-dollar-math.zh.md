# Agent Note: 多行 display-dollar 公式

Status: implemented

[English](2026-09-17-multiline-display-dollar-math.md) | 中文

## Problem

作者和模型会用三种写法写 `$$` display 公式。落定语法（settled grammar）能渲染其中两种：单行 `$$math$$`，以及独占一行的起始 `$$` 与独占一行的结束 `$$` 成对出现。第三种——公式写在起始行、结束 `$$` 位于最后一行公式文本末尾——不能渲染：

```markdown
$$f(x)=x
\text{continued}$$
```

`micromark-extension-math` 把起始 `$$` 之后的文本当作 fence meta，并且只在内容恰为 `$$`（可带前导空白）的行接受结束围栏。[markdown 兼容层](../../archived/feature/2026-07-23-web-assistant-markdown.md) 只接管了单行写法，而落定渲染器把 `node.value` 交给 KaTeX、忽略 `node.meta`。于是该块从不闭合：它把其后的整段文档文本一起吃进去，`value` 保留字面 `$$`，KaTeX 抛出 `Can't use function '$' in math mode`，再由 [katex.tsx](../../../../packages/client/ui-primitives/src/markdown/katex.tsx) 的错误分支把 TeX 源码和被吞掉的正文一起渲染成红色。一次对话回复中，55 行里的第 22–55 行被单个错误 span 覆盖；六个 note 文件在这种块之后的每一行都被同一个错误吞掉。

第二个缺陷出于同一机制：当后面某个孤立的 `$$` 真的闭合了这个 flow 时，起始行已经被归入 `meta`，渲染器便静默丢掉公式的第一行。

## Decision

[mathCompatibility.ts](../../../../packages/client/ui-primitives/src/markdown/mathCompatibility.ts) 接管所有 `$$` flow 围栏。它的 dollar 构造跨多行：起始 `$$` 后同一行带公式时，结束 `$$` 可以落在其后任意内容行末，起始行文本留在 `mathFlowValue` 里而不是变成 fence meta。它的段落中断检查在行尾之前就返回，与 `micromark-extension-math` 自身的 flow 一致：在那里消费行尾会让后续尝试的构造把下一行视为 lazy，正是这一点使上游 flow 在列表项内结束为空。

[parse.ts](../../../../packages/client/ui-primitives/src/markdown/parse.ts) 把 `mathCompatibility()` 注册在 `math()` 之后：micromark 先派发最后注册的扩展，这个顺序才让兼容 flow 接管 `$$`，同时由 `math()` 保留行内 `$…$`。

## Alternatives considered

**兼容层只保留单行 `$$…$$`。** 多行写法是 GitHub、KaTeX auto-render、VS Code 与 Typora 都接受的形式，也是模型写多分支公式时采用的形式；不解析它意味着公式连同其后的整篇文档被一个红色错误 span 顶替。

**解析后再修补语法树。** flow 已把被吞掉的文本收进 `mathFlowValue`，在那里它与公式源码无法区分；`meta` 与 `value` 无法重组回原本的块，而且后续的块根本没有被解析。

**解析前在源文本里重写 `$$` 围栏。** 兼容层按设计是语法扩展；文本处理需要自行定位代码跨度、围栏与转义，而且改的是作者原文而不是解析它。

**只调整注册顺序、不加中断检查。** 先注册兼容 flow 能修好公式，但会使命中失败的中断检查在第二个构造运行前推进解析器的 lazy 表，导致上游 flow 在列表项内结束为空。

## Consequences

三种写法现在产出同一个 math 节点，公式不再在起始行被截断，也不再吞掉其后的正文。`$$` 围栏 meta 不再被支持：`$$asciimath` 会被解析成首行为 `asciimath` 的公式，而上游 flow 会把它拆成 meta 加正文。本仓没有这种写法，渲染器也从不读取 `meta`。

结束 `$$` 之后的尾随文本（`$$x$$ trailing`，或以中文引号收尾的一行正文）仍由上游行内数学解析；`markdown.client.spec.tsx` 中已有的用例钉住了该行为。KaTeX 层面的失败——例如公式源码里的 `\arccot`——按设计仍是错误。

## Testing

`packages/client/ui-primitives/tests/markdown.client.spec.tsx` 覆盖五种写法（单行、起始行带公式并在最后一行末尾闭合、段落中断、列表项内缩进块、起始 `$$` 独占一行的列表项），没有本次改动时该用例失败。DOM 兼容语料新增 `math-multiline-display` 及其 `.settled.txt`、`.streaming.txt` 夹具，同时钉住列首 `$$` 出现在列表项之后时仍位于列表项之外。
