# QiLin DSH 风格消息渲染实现计划

**Goal:** 在保留 QiLin 现有流式消息数据流的前提下，按 DSH 风格渲染可交替出现的正文、工具调用和思考，并为完整 assistant turn 增加统一操作栏与元数据。

**Architecture:** 先扩展消息分段解析，使数组 block、内联 think 和跨 AI 消息都保留真实顺序；再把 SegmentList、ReasoningBlock、ToolGroup 和用户气泡改成无卡片的 DSH 风格。最后在 MessageItem/ProcessingFlow 之后挂载单一 AssistantMessageFooter，由页面层负责复制线程和路由导航。

**Tech Stack:** React 19、Next.js 16、TypeScript、Tailwind CSS v4、LangGraph SDK、streamdown、Vitest、Playwright。

---

## 文件地图

- web-demo/src/core/messages/utils.ts：提供内联 think 顺序切分，以及兼容旧格式的思考识别。
- web-demo/src/core/messages/segments.ts：将 AI 消息转换为保持原顺序的 MessageSegment 流，并合并相邻同类段。
- web-demo/src/core/messages/rendering.ts：纯函数，负责可见正文复制文本和 assistant 元数据读取。
- web-demo/src/components/workspace/chat/segments/segment-list.tsx：按顺序渲染 segment，并暴露稳定的 segment kind 标识。
- web-demo/src/components/workspace/chat/segments/prose-content.tsx：只负责正文 Markdown 和流式动画。
- web-demo/src/components/workspace/chat/segments/reasoning-block.tsx：渲染无卡片 Think 行和可展开正文。
- web-demo/src/components/workspace/chat/segments/tool-group.tsx：渲染无卡片工具行、参数摘要和详情。
- web-demo/src/components/workspace/chat/segments/user-prompt.tsx：渲染 DSH 风格的用户气泡，同时保留编辑、复制、图片和文件。
- web-demo/src/components/workspace/chat/assistant-message-footer.tsx：统一渲染 assistant turn 的复制、分支、重新生成和元数据操作栏。
- web-demo/src/components/workspace/chat/message-item.tsx：为终态 assistant 消息接入 footer。
- web-demo/src/components/workspace/chat/message-feed.tsx：为 processing group 接入 footer，计算最后一个 assistant group，并传递回调。
- web-demo/src/app/workspace/chats/[thread_id]/page.tsx：普通会话的线程复制和 URL 更新。
- web-demo/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx：Agent 会话的线程复制和 URL 更新。
- web-demo/src/core/i18n/locales/types.ts、zh-CN.ts、en-US.ts：新增操作栏文案。
- web-demo/tests/unit/core/message-segments.test.ts：顺序解析回归测试。
- web-demo/tests/unit/core/message-rendering.test.ts：复制文本和 metadata 纯函数测试。
- web-demo/tests/unit/core/reasoning-trigger.test.ts、tool-group.test.tsx：Think/工具行视觉结构测试。
- web-demo/tests/unit/components/workspace/chat/assistant-message-footer.test.tsx：footer 操作和状态测试。
- web-demo/tests/e2e/utils/mock-api.ts、web-demo/tests/e2e/chat.spec.ts：交替消息流、分支和浏览器级布局测试。

## Task 1: 为交替顺序建立失败测试

**Files:**
- Modify: web-demo/tests/unit/core/message-segments.test.ts

- [x] **Step 1: 添加数组 block 交替顺序测试**

在现有 execution-order 测试组中加入：

```ts
 test("keeps thinking, prose, and tools in source order", () => {
   const message = aiMessage({
     id: "ordered-1",
     content: [
       { type: "thinking", thinking: "先定位入口" },
       { type: "text", text: "我先查看文件结构" },
       { type: "tool_call", id: "ordered-tool-1", name: "read_file", args: { file_path: "a.ts" } },
       { type: "thinking", thinking: "已经找到修改点" },
       { type: "text", text: "现在调整组件" },
     ] as unknown as Message["content"],
   });

   const segments = parseMessageSegments(message);

   expect(segments.map((segment) => segment.kind)).toEqual([
     "reasoning",
     "prose",
     "tool_activity",
     "reasoning",
     "prose",
   ]);
   expect(segments[0]).toMatchObject({ kind: "reasoning", content: "先定位入口" });
   expect(segments[1]).toMatchObject({ kind: "prose", content: "我先查看文件结构" });
   expect(segments[3]).toMatchObject({ kind: "reasoning", content: "已经找到修改点" });
 });
```

- [x] **Step 2: 添加多个内联 think 区段测试**

```ts
 test("keeps multiple inline think blocks in order", () => {
   const message = aiMessage({
     id: "ordered-2",
     content: "<think>先读取配置</think>正文一<think>确认修改点</think>正文二",
   });

   expect(parseMessageSegments(message).map((segment) => segment.kind)).toEqual([
     "reasoning",
     "prose",
     "reasoning",
     "prose",
   ]);
 });
```

- [x] **Step 3: 运行测试确认当前实现失败**

运行：

```bash
pnpm -C web-demo exec vitest run tests/unit/core/message-segments.test.ts
```

预期：新增数组测试失败，因为当前实现只从第一个 content block 提取思考，且把多个内联 think 区段合并成一个 reasoning 和一个 prose。

## Task 2: 实现保持顺序的消息解析

**Files:**
- Modify: web-demo/src/core/messages/utils.ts
- Modify: web-demo/src/core/messages/segments.ts
- Test: web-demo/tests/unit/core/message-segments.test.ts

- [x] **Step 1: 在 utils.ts 增加内联 think 顺序切分函数**

新增导出类型和函数，保留现有 splitInlineReasoning 的调用兼容性：

```ts
export type OrderedInlineSegment = {
  kind: "reasoning" | "prose";
  content: string;
};

export function splitInlineReasoningInOrder(
  content: string,
): OrderedInlineSegment[] {
  const result: OrderedInlineSegment[] = [];
  const lowerContent = content.toLowerCase();
  let cursor = 0;

  const push = (kind: OrderedInlineSegment["kind"], value: string) => {
    const normalized = value.trim();
    if (normalized) result.push({ kind, content: normalized });
  };

  while (cursor < content.length) {
    const openIndex = lowerContent.indexOf("<think>", cursor);
    if (openIndex === -1) {
      push("prose", content.slice(cursor));
      break;
    }

    push("prose", content.slice(cursor, openIndex));
    const reasoningStart = openIndex + "<think>".length;
    const closeIndex = lowerContent.indexOf("</think>", reasoningStart);
    if (closeIndex === -1) {
      push("reasoning", content.slice(reasoningStart));
      break;
    }

    push("reasoning", content.slice(reasoningStart, closeIndex));
    cursor = closeIndex + "</think>".length;
  }

  return result;
}
```

- [x] **Step 2: 扩展思考 block 识别**

在 segments.ts 增加局部 type guard，识别 type 为 thinking、reasoning 或 reasoning_content 的 block，并读取 thinking、reasoning、reasoning_content、text、content 中第一个字符串值。没有 type 但含 thinking 字段的兼容 block 也要识别。

```ts
function isReasoningBlock(block: unknown): block is Record<string, unknown> {
  if (typeof block !== "object" || block === null) return false;
  const record = block as Record<string, unknown>;
  return (
    record.type === "thinking" ||
    record.type === "reasoning" ||
    record.type === "reasoning_content" ||
    (record.type === undefined && "thinking" in record)
  );
}

function textFromReasoningBlock(block: Record<string, unknown>): string {
  for (const key of ["thinking", "reasoning", "reasoning_content", "text", "content"]) {
    const value = block[key];
    if (typeof value === "string") return value;
  }
  return "";
}
```

同时将 utils.ts 的 hasReasoning 改为检查全部 content blocks，而不是只检查第一个 block。

- [x] **Step 3: 改写 parseMessageSegments 的 block 遍历**

删除当前函数一开始无条件追加 reasoning 的逻辑。把 hasToolBlocks 分支条件改为 hasOrderedBlocks：数组 content 只要含 tool block 或 reasoning block 就走有序遍历。对数组内容维护 textRun 和 reasoningRun，类型切换时先 flush 当前 run。使用以下条件决定是否进入有序 block 分支：

\`\`\`ts
const hasOrderedBlocks =
  Array.isArray(content) &&
  content.some((block) => isToolBlock(block) || isReasoningBlock(block));
\`\`\`

在 segments.ts 顶层定义 appendSegment，并让 parseMessageSegments 与 parseAssistantSegments 共用它：

```ts
function appendSegment(
  segments: MessageSegment[],
  segment: MessageSegment,
): void {
  const last = segments[segments.length - 1];
  if (segment.kind === "tool_activity" && last?.kind === "tool_activity") {
    last.steps.push(...segment.steps);
    return;
  }
  if (segment.kind === "reasoning" && last?.kind === "reasoning") {
    last.content = [last.content, segment.content].filter(Boolean).join("\n");
    return;
  }
  if (segment.kind === "prose" && last?.kind === "prose") {
    last.content = [last.content, segment.content].filter(Boolean).join("\n");
    return;
  }
  segments.push(segment);
}

// These three declarations live inside parseMessageSegments.
let textRun: string[] = [];
let reasoningRun: string[] = [];

const flushText = () => {
  const text = stripInternalContent(textRun.join("\n").trim());
  textRun = [];
  if (text) appendSegment(segments, { kind: "prose", content: text });
};

const flushReasoning = () => {
  const reasoning = stripInternalContent(reasoningRun.join("\n").trim());
  reasoningRun = [];
  if (reasoning) appendSegment(segments, { kind: "reasoning", content: reasoning });
};
```

遍历每个 block 时执行以下顺序：

```ts
if (isToolBlock(block)) {
  flushText();
  flushReasoning();
  appendSegment(segments, {
    kind: "tool_activity",
    steps: [
      toolStepFromCall(
        {
          id: block.id,
          name: block.name ?? "tool",
          args: (block.args as Record<string, unknown> | undefined) ??
            (block.input as Record<string, unknown> | undefined) ?? {},
        },
        stepIndex++,
        contextMessages,
      ),
    ],
  });
} else if (isReasoningBlock(block)) {
  flushText();
  const reasoning = textFromReasoningBlock(block);
  if (reasoning) reasoningRun.push(reasoning);
} else if (
  typeof block === "object" &&
  block !== null &&
  (block as { type?: unknown }).type === "text" &&
  typeof (block as { text?: unknown }).text === "string"
) {
  flushReasoning();
  textRun.push((block as { text: string }).text);
}
```

数组遍历结束后依次 flushText 和 flushReasoning，并把 content block 之外的 tool_calls 追加到最后。更新现有 pushSteps，使它调用同一个 appendSegment，避免产生第二套合并规则。字符串 content 使用 splitInlineReasoningInOrder 的结果；只有没有可定位 reasoning 时，才把 additional_kwargs.reasoning_content 作为前置段。文件 segment 仍在全部可见内容之后追加。

- [x] **Step 4: 更新 parseAssistantSegments 的相邻段合并**

跨 AI 消息合并时调用同一个模块级 appendSegment，只合并相邻 tool_activity、reasoning 和 prose；绝不跨越另一种 segment 合并。

- [x] **Step 5: 运行顺序测试确认通过**

运行：

```bash
pnpm -C web-demo exec vitest run tests/unit/core/message-segments.test.ts
```

预期：全部 message-segments 测试通过，新增交替顺序测试通过。

- [x] **Step 6: 提交顺序解析阶段**

```bash
git add web-demo/src/core/messages/utils.ts web-demo/src/core/messages/segments.ts web-demo/tests/unit/core/message-segments.test.ts
git commit -m "feat(web-demo): preserve interleaved message segment order"
```

## Task 3: 增加 assistant 复制文本与 metadata 纯函数

**Files:**
- Create: web-demo/src/core/messages/rendering.ts
- Create: web-demo/tests/unit/core/message-rendering.test.ts

- [x] **Step 1: 编写纯函数失败测试**

测试可见正文只取 prose，且按顺序拼接；测试 ISO 时间、epoch 秒、嵌套 metadata、模型名和 token 总数；测试缺失字段返回 undefined。

```ts
const messageWithMetadata = {
  type: "ai",
  response_metadata: { model_name: "model-a" },
  usage_metadata: { input_tokens: 20, output_tokens: 22, total_tokens: 42 },
  metadata: { created_at: "2025-01-01T00:00:00.000Z" },
} as unknown as Message;

const segments: MessageSegment[] = [
  { kind: "reasoning", content: "思考" },
  { kind: "prose", content: "正文一" },
  { kind: "tool_activity", steps: [] },
  { kind: "prose", content: "正文二" },
];

expect(getVisibleAssistantText(segments)).toBe("正文一\n\n正文二");
expect(getVisibleAssistantText([{ kind: "reasoning", content: "only thinking" }])).toBe("");

expect(getAssistantPresentationMetadata(messageWithMetadata)).toMatchObject({
  model: "model-a",
  totalTokens: 42,
});
```

- [x] **Step 2: 运行测试确认失败**

运行：

```bash
pnpm -C web-demo exec vitest run tests/unit/core/message-rendering.test.ts
```

预期：因 rendering.ts 尚不存在而失败。

- [x] **Step 3: 实现 rendering.ts**

导出以下稳定接口：

```ts
export type AssistantPresentationMetadata = {
  timestamp?: number;
  model?: string;
  totalTokens?: number;
};

export function getVisibleAssistantText(segments: MessageSegment[]): string;
export function getAssistantPresentationMetadata(message: Message): AssistantPresentationMetadata;
export function formatAssistantTime(timestamp: number, locale?: string): string;
```

实现细节：

- getVisibleAssistantText 过滤 kind 为 prose 的段，去除空白后用两个换行拼接。
- metadata 从 message.created_at、message.createdAt、metadata.created_at、metadata.createdAt、response_metadata.created_at、additional_kwargs.created_at 依次读取时间。
- 时间数字小于 1e12 按 epoch 秒转换为毫秒；非法日期返回 undefined。
- 模型从 response_metadata.model_name、response_metadata.model、metadata.model_name、additional_kwargs.model_name 依次读取。
- token 总数直接使用现有 getUsageMetadata(message)?.totalTokens。
- formatAssistantTime 使用 Intl.DateTimeFormat，默认只显示小时和分钟，所有调用点传入当前 i18n locale。

- [x] **Step 4: 运行纯函数测试确认通过**

```bash
pnpm -C web-demo exec vitest run tests/unit/core/message-rendering.test.ts
```

- [x] **Step 5: 提交纯函数阶段**

```bash
git add web-demo/src/core/messages/rendering.ts web-demo/tests/unit/core/message-rendering.test.ts
git commit -m "feat(web-demo): add assistant message presentation metadata"
```

## Task 4: 将 segment 组件改成 DSH 风格

**Files:**
- Modify: web-demo/src/components/workspace/chat/segments/segment-list.tsx
- Modify: web-demo/src/components/workspace/chat/segments/prose-content.tsx
- Modify: web-demo/src/components/workspace/chat/segments/reasoning-block.tsx
- Modify: web-demo/src/components/workspace/chat/segments/tool-group.tsx
- Modify: web-demo/src/components/workspace/chat/segments/user-prompt.tsx
- Modify: web-demo/tests/unit/core/reasoning-trigger.test.ts
- Modify: web-demo/tests/unit/core/tool-group.test.tsx

- [x] **Step 1: 给 SegmentList 增加顺序标识包装层**

每个 segment 外层使用同一个宽度约束，并设置 data-segment-kind；不对 segments 排序：

```tsx
<div
  key={segment.kind + "-" + index}
  data-segment-kind={segment.kind}
  className="w-full"
>
  {renderedSegment}
</div>
```

HumanInputCard 仍在 prose 对应的位置渲染，FilesCard 仍在 files segment 位置渲染。

- [x] **Step 2: 移除 ProseContent 内的独立复制按钮**

删除 CheckIcon、CopyIcon、Button、copy state 和绝对定位操作栏，保留以下职责：

```tsx
return (
  <div className={cn("w-full", className)}>
    <MarkdownContent
      content={content}
      isLoading={isLoading}
      className="streamdown-tight"
    />
  </div>
);
```

- [x] **Step 3: 重写 ReasoningBlock 行结构**

保留 expanded state 和 Markdown body，改用无背景、无外层边框的行。行内包含 BrainIcon、思考中/已思考、单行摘要和 ChevronRightIcon：

```tsx
<div className={cn("w-full", className)}>
  <button
    type="button"
    aria-expanded={expanded}
    onClick={() => setExpanded((value) => !value)}
    className={cn(
      "flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left text-sm leading-6 transition-colors",
      "hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring",
      isStreaming ? "text-primary" : "text-muted-foreground",
    )}
  >
    <BrainIcon className="size-3.5 shrink-0" />
    <span className="shrink-0 font-medium">{isStreaming ? "思考中" : "已思考"}</span>
    <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-border" />
    <span className="min-w-0 flex-1 truncate text-muted-foreground">
      {summary(content)}
    </span>
    <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
  </button>
  {expanded && (
    <div className="mt-1 ml-6 max-h-96 overflow-auto text-[13px] leading-6 text-muted-foreground">
      <MarkdownContent content={content} isLoading={isStreaming} className="streamdown-tight" />
    </div>
  )}
</div>
```

summary 取思考内容第一个非空行，长度超过 120 个字符时截断为 117 个字符加省略号。

- [x] **Step 4: 重写 ToolGroup 为平级无卡片工具行**

保留 toolIcon、groupLabel、toolLabel、stepSummary、DetailBlock 和结果解析；替换外层 class 为 w-full，不再使用 rounded-lg border bg-muted/20。多个工具调用显示调用数量标题，展开后显示各个平级 ToolEntry；单个工具调用直接显示工具行。默认折叠行为保持不变。ToolEntry 使用以下结构：

```tsx
<button
  type="button"
  aria-expanded={open}
  disabled={!expandable}
  title={step.name}
  onClick={() => expandable && setOpen((value) => !value)}
  className={cn(
    "flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs leading-6 transition-colors",
    expandable && "hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring",
    !expandable && "cursor-default",
  )}
>
  {running ? <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" /> : <CheckIcon className="size-3 shrink-0 text-emerald-500" />}
  <span className="shrink-0 text-violet-500">{iconGlyph(kind)}</span>
  <span className="shrink-0 font-medium">{toolLabel(step.name)}</span>
  {summary && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{truncateText(summary.text, 72, summary.isPath)}</span>}
  {expandable && <ChevronRightIcon className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />}
</button>
```

参数/结果详情改为左侧细线、无填充卡片的文本块；详情 max-height 保持 48 以防止长结果撑高消息流。

- [x] **Step 5: 调整 UserPrompt 的 DSH 气泡，同时保留编辑流程**

将当前 UserPrompt JSX 中的容器和 article class 改为：

```tsx
const userContainerClass =
  "ml-auto flex w-full max-w-[72%] flex-col gap-1.5";
const userBubbleClass =
  "text-foreground rounded-[22px] bg-muted px-4 py-2.5 text-left text-base leading-6 whitespace-pre-wrap";
```

在现有 outer div 使用 userContainerClass，在现有 article 使用 userBubbleClass；editing 分支、附件和图片渲染不变。

删除 article 的 border、shadow、text-right；编辑 textarea 继续保持可见边框和保存/取消按钮，附件图片继续右对齐。

- [x] **Step 6: 更新组件静态测试**

在 reasoning-trigger.test.ts 保留现有 createElement/renderToStaticMarkup 方式，并加入：

```ts
expect(html).toContain("已思考");
expect(html).toContain("thinking text");
expect(html).toContain("aria-expanded=\"false\"");
expect(html).not.toContain("<div class=\"mt-1 ml-6");
```

在 tool-group.test.tsx 保留工具名称、数量、摘要和默认折叠断言，并加入：

```ts
expect(html).toContain("2 个工具调用");
expect(html).toContain("写入文件");
expect(html).not.toContain("rounded-lg border border-border/50 bg-muted/20");
expect(html).not.toContain("参数");
expect(html).not.toContain("执行结果");
```

默认折叠仍不渲染参数/执行结果；展开测试继续验证详情可以出现。若 className 顺序经 formatter 调整，断言改为分别检查 rounded-lg、border-border/50 和 bg-muted/20 均不存在。

- [x] **Step 7: 运行相关测试与 typecheck**

```bash
pnpm -C web-demo exec vitest run tests/unit/core/reasoning-trigger.test.ts tests/unit/core/tool-group.test.tsx tests/unit/core/message-segments.test.ts
pnpm -C web-demo exec tsc --noEmit
```

预期：测试和 typecheck 均通过。

- [x] **Step 8: 提交 segment 视觉阶段**

```bash
git add web-demo/src/components/workspace/chat/segments web-demo/tests/unit/core/reasoning-trigger.test.ts web-demo/tests/unit/core/tool-group.test.tsx
git commit -m "feat(web-demo): align message segments with DSH flow"
```

## Task 5: 创建统一 assistant footer 与国际化文案

**Files:**
- Create: web-demo/src/components/workspace/chat/assistant-message-footer.tsx
- Modify: web-demo/src/core/i18n/locales/types.ts
- Modify: web-demo/src/core/i18n/locales/zh-CN.ts
- Modify: web-demo/src/core/i18n/locales/en-US.ts
- Create: web-demo/tests/unit/components/workspace/chat/assistant-message-footer.test.tsx

- [x] **Step 1: 增加 messageActions 类型和中英文文案**

在 Translations 增加：

```ts
messageActions: {
  copy: string;
  copied: string;
  copyFailed: string;
  branch: string;
  branching: string;
  branchFailed: string;
  regenerate: string;
  noVisibleContent: string;
};
```

中文值：复制、已复制、复制失败、复制当前线程到新会话、复制中、创建分支失败、重新生成、没有可复制的正文。英文值提供等义文案。现有 clipboard 分组继续供 UserPrompt 使用。

- [x] **Step 2: 编写 footer 状态测试**

测试 props 接口：

```ts
export type AssistantMessageFooterProps = {
  message: Message;
  segments: MessageSegment[];
  threadId: string;
  isLoading?: boolean;
  onBranchThread?: () => Promise<void>;
  onRegenerate?: () => void;
};
```

使用 renderToStaticMarkup 验证初始结构：isLoading 时没有操作按钮；非 loading 时有复制按钮和分支按钮；有 onRegenerate 时有重新生成按钮；没有 prose 时不显示复制按钮。再使用 render 与 fireEvent 点击按钮，mock navigator.clipboard，验证复制成功状态、复制失败 toast、分支 loading 状态和重复点击保护：

```tsx
const view = render(
  <AssistantMessageFooter
    message={aiMessage}
    segments={[{ kind: "prose", content: "可见正文" }]}
    threadId="thread-1"
    onBranchThread={branch}
    onRegenerate={regenerate}
  />,
);

fireEvent.click(view.getByTestId("assistant-action-copy"));
expect(navigator.clipboard.writeText).toHaveBeenCalledWith("可见正文");
fireEvent.click(view.getByTestId("assistant-action-branch"));
expect(branch).toHaveBeenCalledTimes(1);
```


- [x] **Step 3: 实现 AssistantMessageFooter**

组件结构固定为一个 hover/focus 可见的 flex 行。组件开头使用 const { locale, t } = useI18n()，把 locale 传给时间格式化函数：

```tsx
<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/conversation-message:opacity-100 focus-within:opacity-100">
    <Button data-testid="assistant-action-copy" size="icon-sm" variant="ghost" type="button" aria-label={t.messageActions.copy} title={t.messageActions.copy} />
    <Button data-testid="assistant-action-branch" size="icon-sm" variant="ghost" type="button" aria-label={t.messageActions.branch} title={t.messageActions.branch} />
    {onRegenerate && <Button data-testid="assistant-action-regenerate" size="icon-sm" variant="ghost" type="button" aria-label={t.messageActions.regenerate} title={t.messageActions.regenerate} />}
  </div>
  {metadata.timestamp && <span>{formatAssistantTime(metadata.timestamp, locale)}</span>}
  {metadata.model && <span>{metadata.model}</span>}
  {metadata.totalTokens !== undefined && <span>{formatTokenCount(metadata.totalTokens)} tokens</span>}
</div>
```

实现要求：

- copy 使用 getVisibleAssistantText；成功后 1.5 秒显示 copied 状态；clipboard API 异常时调用 toast.error(t.messageActions.copyFailed)。
- branch 使用本地 isBranching 状态，调用 onBranchThread；成功由页面回调导航，失败调用 toast.error(t.messageActions.branchFailed)。没有 onBranchThread 时不渲染分支按钮。
- footer 在 isLoading 时直接返回 null。
- 导入现有 formatTokenCount，并使用 Lucide 的 CopyIcon、CheckIcon、GitBranchIcon、RefreshCwIcon、Loader2Icon；给每个 icon button 设置固定尺寸。
- footer 不显示 reasoning、tool_activity 和 files 的复制内容。

- [x] **Step 4: 运行 footer 测试**

```bash
pnpm -C web-demo exec vitest run tests/unit/components/workspace/chat/assistant-message-footer.test.tsx
```

- [x] **Step 5: 提交 footer 阶段**

```bash
git add web-demo/src/components/workspace/chat/assistant-message-footer.tsx web-demo/src/core/i18n/locales/types.ts web-demo/src/core/i18n/locales/zh-CN.ts web-demo/src/core/i18n/locales/en-US.ts web-demo/tests/unit/components/workspace/chat/assistant-message-footer.test.tsx
git commit -m "feat(web-demo): add assistant turn action footer"
```

## Task 6: 接入 MessageItem、ProcessingFlow 和分支线程

**Files:**
- Modify: web-demo/src/components/workspace/chat/message-item.tsx
- Modify: web-demo/src/components/workspace/chat/message-feed.tsx
- Modify: web-demo/src/app/workspace/chats/[thread_id]/page.tsx
- Modify: web-demo/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx

- [x] **Step 1: 给 MessageItem 增加 footer 回调 props**

增加 props：

```ts
onBranchThread?: () => Promise<void>;
onRegenerate?: () => void;
```

在 SegmentList 后渲染：

```tsx
<AssistantMessageFooter
  message={message}
  segments={segments}
  threadId={threadId}
  isLoading={isLoading}
  onBranchThread={onBranchThread}
  onRegenerate={onRegenerate}
/>
```

用户消息分支保持不变，不给 human message 添加 assistant footer。

- [x] **Step 2: 让 MessageFeed 先得到稳定的 group 列表**

从 core/messages/utils.ts 引入 MessageGroup 类型，在 MessageFeed props type 增加 onBranchThread?: () => Promise<void>，再把现在直接调用 groupMessages 的 JSX 改为 useMemo，保留同样的 isCurrentTurnLoading 选项：

```tsx
const groupedMessages = useMemo(
  () =>
    groupMessages(messages, (group) => group, {
      isCurrentTurnLoading: thread.isLoading,
    }),
  [messages, thread.isLoading],
);

const footerGroupId = [...groupedMessages]
  .reverse()
  .find(
    (group) =>
      group.type === "assistant" || group.type === "assistant:processing",
  )?.id;
```

渲染改为 groupedMessages.map。现有 human、clarification、present-files、subagent 分支内部逻辑保持原样。

- [x] **Step 3: 为普通 assistant group 和 processing group 接入 footer**

在普通 assistant group 中把 isFooterGroup 传入 MessageItem。先在现有 group 渲染分支中加入：

```tsx
const isFooterGroup = group.id === footerGroupId;
const messageItemActions = {
  onBranchThread: isFooterGroup ? onBranchThread : undefined,
  onRegenerate: isFooterGroup && canRegenerate ? handleRegenerate : undefined,
};
```

把 messageItemActions 展开到现有 MessageItem props 中，保留现有 message、contextMessages、threadId、isLoading、onEditMessage 和 className 传值。

ProcessingFlow 新增 showFooter、onBranchThread、onRegenerate props，类型固定为 showFooter: boolean、onBranchThread?: () => Promise<void>、onRegenerate?: () => void。在 SegmentList 后追加同一份 AssistantMessageFooter，message 使用 groupMessages 中最后一个 AI 消息，segments 使用当前聚合结果。isLoading 时 footer 自动隐藏。删除原来 MessageFeed 末尾的独立重新生成按钮，避免重复；对于 present-files 等没有普通 footer 的终态组，保留一个同位置的 regenerate fallback。

- [x] **Step 4: 普通会话增加复制线程回调**

在 web-demo/src/app/workspace/chats/[thread_id]/page.tsx 引入 getAPIClient，并加入：

```tsx
const handleBranchThread = useCallback(async () => {
  const copied = await getAPIClient(isMock).threads.copy(threadId);
  if (!copied.thread_id) {
    throw new Error("Copied thread did not return a thread id");
  }
  setThreadId(copied.thread_id);
  setIsNewThread(false);
  history.pushState(null, "", "/workspace/chats/" + copied.thread_id);
}, [isMock, threadId, setIsNewThread, setThreadId]);
```

将 onBranchThread={isMock ? undefined : handleBranchThread} 传给 MessageFeed。使用 native history，避免当前页面因为分支动作重新挂载并丢失状态。

- [x] **Step 5: Agent 会话增加带 agent_name 的复制线程回调**

在 AgentChatPage 添加同样的 threads.copy 调用，URL 使用：

```ts
"/workspace/agents/" + encodeURIComponent(agent_name) + "/chats/" + copied.thread_id
```

将回调传给 AgentChatPage 的 MessageFeed；静态 demo 或线程 id 为空时不显示分支按钮。

- [x] **Step 6: 运行 typecheck 和相关单元测试**

```bash
pnpm -C web-demo exec tsc --noEmit
pnpm -C web-demo exec vitest run tests/unit/core/message-segments.test.ts tests/unit/core/message-rendering.test.ts tests/unit/core/reasoning-trigger.test.ts tests/unit/core/tool-group.test.tsx tests/unit/components/workspace/chat/assistant-message-footer.test.tsx
```

- [x] **Step 7: 提交页面接入阶段**

```bash
git add web-demo/src/components/workspace/chat/message-item.tsx web-demo/src/components/workspace/chat/message-feed.tsx web-demo/src/app/workspace/chats/[thread_id]/page.tsx web-demo/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx
git commit -m "feat(web-demo): wire assistant footer and thread branching"
```

## Task 7: 扩展 mock 流并完成浏览器级验证

**Files:**
- Modify: web-demo/tests/e2e/utils/mock-api.ts
- Modify: web-demo/tests/e2e/chat.spec.ts

- [x] **Step 1: 增加交替消息流 mock**

新增 handleInterleavedRunStream，使用与 handleRunStream 相同的 SSE 序列化方式，返回以下确定消息：

```ts
export function handleInterleavedRunStream(route: Route) {
  const events = [
    { event: "metadata", data: { run_id: MOCK_RUN_ID, thread_id: MOCK_THREAD_ID } },
    {
      event: "values",
      data: {
        messages: [
          { type: "human", id: "msg-human-ordered", content: "Hello" },
          {
            type: "ai",
            id: "msg-ai-ordered",
            content: [
              { type: "thinking", thinking: "先定位入口" },
              { type: "text", text: "我先查看文件结构" },
              { type: "tool_call", id: "ordered-tool-1", name: "read_file", args: { file_path: "a.ts" } },
              { type: "thinking", thinking: "已经找到修改点" },
              { type: "text", text: "现在调整组件" },
            ],
          },
          { type: "tool", id: "tool-result-ordered", tool_call_id: "ordered-tool-1", name: "read_file", content: "file content" },
        ],
      },
    },
    { event: "end", data: {} },
  ];
  const body = events
    .map((event) => "event: " + event.event + "\ndata: " + JSON.stringify(event.data) + "\n\n")
    .join("");
  return route.fulfill({ status: 200, contentType: "text/event-stream", body });
}
```

消息同时满足 tool_call 和 tool result 的关联格式，确保 ToolGroup 能回填执行结果。

- [x] **Step 2: 增加线程 copy mock**

在 mockLangGraphAPI 中注册 POST 路径 /api/langgraph/threads/*/copy，返回：

```json
{
  "thread_id": "00000000-0000-0000-0000-000000000002",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z",
  "metadata": {},
  "status": "idle",
  "values": {}
}
```

- [x] **Step 3: 添加交替顺序和 footer E2E 测试**

从 web-demo/tests/e2e/utils/mock-api.ts 引入 handleInterleavedRunStream，从 @playwright/test 引入 expect 和 test；测试操作使用以下完整代码：

```ts
 test("renders interleaved segments and branches the thread", async ({ page }) => {
   await page.route("**/runs/stream", handleInterleavedRunStream);
   await page.goto("/workspace/chats/new");
   const textarea = page.getByPlaceholder(/how can i assist you/i);
   await textarea.fill("Hello");
   await textarea.press("Enter");

   const segments = page.locator("[data-segment-kind]");
   await expect.poll(() => segments.count()).toBe(5);
   await expect.poll(async () => segments.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-segment-kind")))).toEqual([
     "reasoning",
     "prose",
     "tool_activity",
     "reasoning",
     "prose",
   ]);
   await expect(page.getByTestId("assistant-action-copy")).toHaveCount(1);
   await expect(page.getByTestId("assistant-action-branch")).toHaveCount(1);

   await page.getByTestId("assistant-action-branch").click();
   await expect(page).toHaveURL(new RegExp(MOCK_THREAD_ID_2));
 });
```

断言用户气泡的 computed max-width 不超过视口宽度的 72%，并在点击分支后确认页面没有新增 console error。

- [x] **Step 4: 运行 E2E 测试**

```bash
pnpm -C web-demo exec playwright test tests/e2e/chat.spec.ts
```

预期：现有新会话、输入、发送测试和新增交替渲染/分支测试全部通过。

- [x] **Step 5: 启动 QiLin 前端并做人工浏览器检查**

使用持久 terminal 启动：

```bash
pnpm -C web-demo run dev
```

记录 terminal 输出中的实际 URL，不假设端口。使用 Playwright 打开该 URL，进入 mock 或真实测试会话，检查：

1. 正文、工具、思考严格按 source order 交替显示。
2. Think 和工具行无外层厚卡片，详情展开不产生横向溢出。
3. 用户气泡右对齐、72% 宽度上限、16px/24px 文本和 22px 圆角。
4. assistant turn 末尾只有一个 footer，复制不会复制思考和工具详情。
5. 分支复制完成后进入新 thread；失败时保留当前 thread 并显示错误提示。
6. 桌面宽度和窄屏宽度下无重叠、无横向滚动；console 无新增错误。

- [x] **Step 6: 完成全量前端验证**

```bash
pnpm -C web-demo exec tsc --noEmit
pnpm -C web-demo run lint
pnpm -C web-demo test
pnpm -C web-demo run build
```

预期：typecheck、lint、Vitest 和 Next build 全部成功。

- [x] **Step 7: 检查差异并提交验证阶段**

```bash
git diff --check
git status --short
git log --oneline -8
```

只确认消息渲染相关文件被修改；不要把截图、临时输出或 DSH checkout 文件加入提交。若验证期间产生仅用于本地测试的临时文件，删除它们后再提交：

```bash
git add web-demo/tests/e2e/utils/mock-api.ts web-demo/tests/e2e/chat.spec.ts
git commit -m "test(web-demo): verify DSH message rendering flow"
```

## 实现完成判定

- 顺序解析测试覆盖数组 block、多个内联 think、跨 AI 消息和旧 tool_calls 格式。
- SegmentList 输出的 data-segment-kind 顺序与 source order 一致。
- UserPrompt、ReasoningBlock、ToolGroup 与 DSH 参考的无卡片视觉层级一致。
- 一个完整 assistant turn 只有一个 AssistantMessageFooter；复制、分支和重新生成操作均可访问。
- 分支调用使用 LangGraph SDK 的 threads.copy，并在普通会话和 Agent 会话中正确更新 URL。
- 缺失 timestamp、model 或 token metadata 时不显示伪造信息。
- typecheck、lint、Vitest、E2E 和 Next build 全部通过。

## 风险与回滚检查

- 如果旧格式顺序测试失败，先保留失败样例，回退 Task 2 中新增的 block 分支，确认原有 tool_calls 和字符串正文行为恢复后再继续。
- 如果线程复制接口在部署环境返回错误，保持 footer 其他操作可用，停止传递 onBranchThread，不把失败的导航状态写入 history。
- 每个阶段先运行对应的 focused test 再提交；需要回滚时按提交顺序使用 git revert，避免重置用户已有的工作区改动。
- 最终 git status 只允许出现本计划相关的已提交结果，不得包含截图、构建缓存或 DSH checkout 文件。
