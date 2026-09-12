# 开发态流式渲染与任务中断修复设计

日期：2026-09-12
状态：待用户复核

## 1. 背景与证据

当前问题有两个相互关联但需要分开处理的表现：

1. agent 执行任务期间，前端消息逐段渲染掉帧，长对话滚动也会卡顿。
2. 任务在前端状态变化或发送冲突后可能被自动中断。

已确认的代码证据：

- LangGraph SDK 的 useStream 未设置 throttle，StreamManager 默认对每个 SSE 增量立即通知 React。
- MessageFeed 每次消息变化都会重新分组整个消息列表，并把新的 contextMessages 数组传给所有 MessageItem。默认 memo 因此不能隔离已经完成的消息。
- MessageFeed 的会话事件 effect 会在每个流式更新上扫描历史，并重复派发已处理的 turn、tool call、tool result。
- useThreadStream.sendMessage 遇到 409 时会自动再次提交 multitaskStrategy="interrupt"。这会把旧 run 当成冲突对象中断，而 409 可能只是页面重连或 UI 状态滞后。
- 显式停止按钮仍然调用 thread.stop() 和 run cancel；本设计不删除用户主动停止能力，只禁止冲突路径代替用户执行停止。

## 2. 目标

- 在开发模式下把 React 消息更新限制在稳定的帧预算内，同时保持 SSE 数据完整。
- 已完成的历史消息不因当前 token 更新而重复解析和重绘。
- 会话插件事件只在出现新 turn、tool call、tool result 或新的交付文件时派发。
- 任何发送冲突都不能自动中断正在运行的任务。
- 发送冲突的消息进入现有队列，避免用户消息丢失。
- 保留用户点击停止按钮后的显式中断行为。

## 3. 非目标

- 不切换生产构建，不修改 start-all.sh --prod 的行为。
- 不改变网关的 run 状态模型、SSE 协议或任务执行逻辑。
- 不在本次改动中引入完整虚拟列表；如果节流和已完成消息隔离后长列表仍有问题，再单独评估虚拟化。
- 不通过增加超时掩盖断流或渲染问题。

## 4. 方案

### 4.1 流式更新节流

在 useThreadStream 传给 useStream 的选项中设置固定的渲染节流值，初始值为 16ms。

节流只控制 React 外部订阅者的通知频率，不丢弃 SDK 内部收到的 SSE 事件。多个 token 在一个通知窗口内合并，渲染频率上限约为 60fps，任务执行和事件接收仍按原速度继续。

该值提取为带名称的常量，便于测试和后续调参；不使用任意 sleep，也不改变后端生成速度。

### 4.2 已完成消息隔离

给 MessageItem 增加针对消息状态的比较逻辑：

- 当前正在流式更新的消息仍正常重渲染。
- 已结束消息按 thread、message id/type、loading 状态和实际操作状态比较。
- 已结束消息忽略仅用于查找工具结果的上下文数组引用变化。
- 消息操作回调通过稳定引用或 ref 转发保持最新行为，避免为了 memo 化而捕获旧 thread 状态。

因此当前 token 只影响活动 processing group 和活动消息，不再让整段历史重新解析 Markdown、工具结果和 footer。

### 4.3 会话事件增量派发

在 MessageFeed 中按 thread 维护已派发的 turn、tool call、tool result 和 deliverables 签名：

- 已派发的事件不重复进入 conversation-store。
- 新增 tool result 仍会派发一次，错误状态变化也会进入新的结果签名。
- thread 切换时清空该 thread 的本地派发游标。
- deliverables 只有路径集合发生变化时才更新。

这保留插件晚注册时依赖的全局 event log，同时避免正常流式更新持续触发相同事件和订阅者重绘。

### 4.4 409 冲突不再自动 interrupt

调整 sendMessage 的冲突分支：

- 删除 409 后调用 doSubmit("interrupt") 的自动接管。
- 忽略 busy conflict 的重复 toast，让控制器统一处理。
- useChatPageController.handleSubmit 捕获 busy conflict 后，把原消息放入现有队列，并提示用户当前任务仍在运行。
- 当前 run 继续执行；现有重连机制负责重新加入 stream。
- 用户点击停止按钮仍走原来的 thread.stop，这是唯一保留的前端主动中断入口。

这样，页面状态短暂落后、组件重挂载或重复提交只会导致排队，不会杀掉当前任务。

## 5. 测试设计

先添加回归测试，再实现代码：

1. 线程流提交在 busy 409 后不会再次以 multitaskStrategy="interrupt" 提交。
2. 控制器收到 busy 409 会把原消息放进队列，消息内容和附件保留。
3. 显式停止仍调用 stop/cancel 路径。
4. 消息项在非活动消息的上下文数组引用变化时保持渲染结果和交互行为。
5. 流式节流选项被传入 useStream，并且不改变消息最终内容。
6. 会话事件对同一 turn/tool call/result 不重复派发，新增结果仍能派发。

## 6. 验收标准

- 前端开发服务器运行时，长任务的消息更新不再随每个 token 触发完整历史重绘。
- 长对话滚动时，已完成消息不因活动消息增量而重复解析。
- 409 冲突不会向网关发送自动 interrupt，也不会出现旧 run 被新提交抢占。
- 用户输入在冲突时进入队列，当前任务继续运行。
- 点击“停止当前任务”仍能中断当前任务。
- 前端 typecheck、相关 Vitest 测试和完整前端检查通过。
- 不要求生产构建，不改变用户当前开发环境启动方式。

## 7. 风险与回滚

- 16ms 节流可能让极快 token 流的视觉更新从逐 token 变成批量更新；最终文本和事件顺序不变。如果体感仍偏卡，只调节常量，不改变任务协议。
- 已完成消息比较逻辑若遗漏某种可变字段，可能导致历史消息未及时更新。测试覆盖工具结果新增和显式操作状态，并保留活动消息全量更新。
- 队列降级会改变 409 后的用户体验：从自动抢占旧任务改为等待当前任务结束。这是本次修复的预期行为。

## 8. 影响文件范围

预计只修改：

- web-demo/src/core/threads/hooks.ts
- web-demo/src/components/workspace/chats/use-chat-page-controller.ts
- web-demo/src/components/workspace/chat/message-item.tsx
- web-demo/src/components/workspace/chat/message-feed.tsx
- 对应 web-demo/tests/unit 测试文件

不修改生产启动脚本，不修改网关 run 执行逻辑。
