# QiLin 消息时间流与 DSH 风格渲染设计

- 日期：2026-08-29
- 状态：已获用户确认，待文档复核
- 目标版本：QiLin v2.0.1 后续前端改进

## 1. 背景

QiLin 当前已经具备 assistant 消息分段、Markdown 流式渲染、工具结果关联、思考块折叠和重新生成能力，但视觉组织方式与本地 DeepSeek Harness（DSH）存在差异：正文偏紧凑，用户消息使用带边框气泡，Think 和工具活动使用卡片容器，assistant 操作入口分散在各个正文段落。

DSH 的参考形态是无卡片的消息阅读流：assistant 正文以较宽的 Markdown 阅读列展示，Think 和工具调用以紧凑的无边框行展示，用户消息使用右侧实心气泡，完整 assistant turn 结束后统一显示操作和元数据。

本设计把 QiLin 的消息流调整为上述形态，同时保留现有后端协议、流式消息管线、工具结果解析和特殊消息卡片。

## 2. 目标与非目标

### 2.1 目标

1. 按真实顺序渲染正文、工具调用和思考，使它们可以交替出现。
2. 将用户气泡、assistant 正文、Think 行、工具行和操作栏调整为 DSH 风格的信息层级。
3. 为一个完整 assistant turn 提供单一的复制、分支和重新生成操作栏。
4. 在有可靠来源时展示时间、模型和 token 元数据；缺失时不伪造数据。
5. 保持流式更新、历史分页、工具结果回填、文件交付和澄清卡片行为不变。
6. 为顺序解析、组件状态和分支失败路径补充自动化测试，并通过浏览器检查桌面与窄屏布局。

### 2.2 非目标

1. 不修改 QiLin 后端 API、LangGraph 消息持久化格式或工具协议。
2. 不引入点赞/点踩等当前没有后端处理能力的假操作。
3. 不把思考内容、工具参数或工具结果混入 assistant 可见正文的复制文本。
4. 不重写整个消息分组系统，不改变特殊的 subagent、文件交付和 human input 展示方式。
5. 不复制 DSH 的实现代码；只参考其已观察到的布局和交互语义。

## 3. 消息顺序模型

### 3.1 分段类型

继续使用现有 MessageSegment 联合类型：

- reasoning：可折叠的思考内容。
- prose：可见 Markdown 正文。
- tool_activity：连续工具调用组成的活动组，组内保留每一步的名称、参数摘要和结果。
- files：交付文件或内联文件展示。

SegmentList 是 assistant turn 的唯一顺序渲染入口，不根据 segment 类型重新排序。

### 3.2 解析规则

1. 数组形式的 message.content 按原始 block 顺序遍历，支持 thinking、reasoning、text、tool_call 和 tool_use。
2. 从一种内容类型切换到另一种类型时，先结束当前文本或思考段，再追加新的 segment。
3. 连续的工具调用合并为一个 tool_activity，正文或思考会自然结束工具组，使工具组出现在正确的 prose/reasoning 之间。
4. 连续的思考 block 可以合并，避免流式分片产生大量重复行；不得跨越正文或工具调用合并。
5. tool_calls 字段中没有出现在 content block 的调用，继续放在该消息已有正文/思考之后，兼容只使用该字段的网关。
6. 字符串中的多个 think 区段按标签位置切分为 reasoning/prose 交替段，而不是将所有思考统一移动到开头。
7. 独立的 additional_kwargs.reasoning_content 没有位置元数据时，仅在该消息没有可定位的 thinking/reasoning block 时作为前置思考段显示。
8. 思考段、正文段和工具段为空时不渲染；未知 block 安全忽略。
9. 跨多个连续 AI 消息时，按消息数组顺序合并 segment，仅合并相邻的同一工具活动组和相邻思考片段。

典型结果：

思考：先定位入口
正文：我先查看文件结构
工具：读取文件
思考：已经找到修改点
正文：现在调整组件
工具：编辑文件
正文：修改完成

## 4. 组件与数据流

### 4.1 SegmentList

SegmentList 继续负责按顺序分派 segment，但增加稳定的 data-segment-kind 标识，便于测试、可访问性检查和浏览器验证。它不负责合并、排序或复制文本。

### 4.2 ProseContent

ProseContent 只负责 Markdown 管线和流式动画。移除每个正文块右上角的独立复制按钮，避免一个 assistant turn 出现多个复制入口；复制统一由 footer 处理。现有安全链接、代码块、表格、引用和流式平滑显示逻辑保持不变。

### 4.3 ReasoningBlock

ReasoningBlock 改为无背景、无外层边框的紧凑行：

- 脑图标。
- 思考中 或 已思考 状态。
- 一条由思考内容生成的单行摘要。
- 展开箭头和 aria-expanded。

展开后仍使用 Markdown 管线展示完整内容，默认折叠规则不变。思考行不插入独立卡片，也不从 SegmentList 中移位。

### 4.4 ToolGroup

ToolGroup 去掉当前外层卡片背景和边框。工具活动使用 DSH 风格的无背景行：

- 执行中/完成状态图标。
- 工具调用标题和调用数量。
- 工具名称及首要参数的截断摘要。
- 可选的展开箭头。

连续工具调用仍在同一活动组内，组内每一步作为平级行展示；参数和结果展开内容采用轻量的文本块或左侧强调线，不使用卡片套卡片。工具结果缺失时继续显示调用本身，并允许后续状态更新。

### 4.5 AssistantMessageFooter

新增 AssistantMessageFooter，位于一个完整 assistant turn 的全部 segments 之后：

- 复制：只复制本 turn 的可见 prose，按 segment 顺序拼接，排除 reasoning、tool_activity 和 files。
- 分支会话：调用 getAPIClient().threads.copy(threadId) 复制当前完整线程，成功后跳转复制出的 thread；按钮在请求期间禁用。
- 重新生成：复用现有 regenerate/checkpoint-replay 逻辑，只在最后一个可重新生成的 turn 显示。
- 元数据：按可用性展示时间、模型名和 token 数量；时间和模型字段来自消息 metadata、response metadata 等已存在字段，无法确认时省略。

MessageItem 为终态 assistant 消息渲染一个 footer；ProcessingFlow 为整个中间 assistant processing group 渲染一个 footer。流式过程中不显示 footer，避免它在 segment 之间跳动或重复。

### 4.6 MessageFeed 与页面导航

MessageFeed 负责把复制、分支和重新生成回调传入相应 turn。分支回调在页面层完成线程复制和路由跳转，避免 segment 组件直接依赖路由。复制失败时保持当前线程和滚动位置，并通过现有 toast 反馈。

特殊的 clarification、present-files、subagent 和文件列表继续使用现有 group 分支；它们只共享 assistant 正文的排版基础，不被强制转换成普通 prose。

## 5. 视觉规范

### 5.1 Assistant 阅读流

- assistant 内容不使用统一大卡片背景。
- 正文使用消息外观设置中的宽度、字号和行高；默认向 DSH 的 16px/28px 阅读节奏靠拢。
- 默认正文阅读列最大宽度约为 48rem，窄屏下使用 width: 100% 和父容器内边距，不能产生横向滚动。
- Think 和工具行使用约 14px/24px，弱化摘要颜色，状态色仅用于图标和运行状态。
- 代码块、表格等固定格式内容必须保持稳定尺寸，避免流式更新导致布局跳动。

### 5.2 用户气泡

- 右对齐，最大宽度约 72%。
- 16px/24px，水平内边距约 16px，垂直内边距约 10px。
- 使用 muted 实心背景和约 22px 圆角，不使用边框和厚重阴影。
- 多行文本左对齐；图片和文件附件继续单独渲染。

### 5.3 操作栏

- 操作按钮为图标按钮，使用 aria-label、title 和可见 focus 状态。
- 默认弱化显示，鼠标悬停完整 turn 或键盘 focus 时可见。
- 操作栏不改变消息正文高度的计算方式，不遮挡最后一行内容。
- 窄屏下操作按钮保持固定尺寸并允许元数据换行，不让长文本撑宽页面。

## 6. 错误处理与兼容性

- 分支复制请求使用本地 loading 状态防止重复提交；网络错误、权限错误或返回无 thread id 时不导航，显示可理解的错误提示。
- 剪贴板 API 不可用或拒绝时只提示复制失败，不影响消息渲染。
- 时间解析支持 ISO 字符串、epoch 数字和已知 metadata 嵌套路径；非法值直接省略。
- 旧字符串正文、旧 tool_calls 字段、Anthropic tool_use、带 think 的正文和数组 block 均保留兼容路径。
- DEFERRED_TOOLS、human input、artifact、subagent 和隐藏内部内容的现有过滤语义保持不变。
- 分支复制当前完整线程，不承诺按某一条历史消息截断；按钮文案和 tooltip 明确表达为复制当前线程到新会话。

## 7. 实现范围

预计修改或新增：

- web-demo/src/core/messages/segments.ts
- web-demo/src/core/messages/utils.ts
- web-demo/src/components/workspace/chat/message-feed.tsx
- web-demo/src/components/workspace/chat/message-item.tsx
- web-demo/src/components/workspace/chat/segments/segment-list.tsx
- web-demo/src/components/workspace/chat/segments/prose-content.tsx
- web-demo/src/components/workspace/chat/segments/reasoning-block.tsx
- web-demo/src/components/workspace/chat/segments/tool-group.tsx
- web-demo/src/components/workspace/chat/segments/user-prompt.tsx
- 新增 AssistantMessageFooter 及必要的消息 metadata/复制辅助函数。
- 对应的消息分段、组件和端到端测试文件。

不修改 DSH checkout，不修改 QiLin 后端协议，不修改与本需求无关的工作区、侧边栏或发布配置。

## 8. 测试与验收

### 8.1 单元测试

1. 分段解析：thinking → prose → tool → thinking → prose 的顺序保持不变。
2. 数组 block、内联 think、跨 AI 消息、Anthropic tool_use 和仅有 tool_calls 的旧格式均能正确解析。
3. 连续工具调用合并，正文和思考会正确切开工具活动组。
4. ReasoningBlock 默认折叠、摘要显示和完整内容展开行为正确。
5. ToolGroup 工具行、状态、摘要、详情展开和缺失结果行为正确。
6. footer 只复制可见正文，单个完整 turn 只渲染一个 footer。
7. 分支成功跳转、重复点击保护和失败回退行为正确。
8. 时间/token metadata 的有效值和缺失值行为正确。

### 8.2 浏览器验证

使用 web-demo 的本地开发/构建产物检查：

1. 含多段正文、思考和工具调用的真实会话顺序。
2. 用户气泡在桌面和窄屏的宽度、换行和对齐。
3. Think 和工具行的展开、折叠及工具结果回填。
4. assistant footer 的单实例、复制、分支和重新生成动作。
5. 无横向溢出、无重叠、流式处理中只有一个处理指示器。
6. 浏览器 console 无新增错误。

### 8.3 通过条件

- pnpm -C web-demo exec tsc --noEmit 通过。
- 相关 Vitest 测试通过。
- ESLint 对修改文件无新增错误。
- Playwright 桌面与窄屏检查通过，交替顺序和关键操作可访问。

## 9. 回滚策略

如果顺序解析导致旧消息格式出现异常，优先回滚解析器的新增 block 分支，保留已验证的视觉组件改动。若线程复制接口在某一部署环境不可用，则禁用分支动作并保留复制/重新生成及其余视觉改动，不修改后端协议。所有改动集中在消息渲染边界，能够通过单个前端提交回滚。
