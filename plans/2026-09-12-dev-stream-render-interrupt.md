# 开发态流式渲染与任务中断修复

## 目标

降低开发环境中 agent 流式消息的 React 重绘成本，并阻止 409 busy 冲突路径自动中断当前任务。网关协议、开发启动方式和显式停止按钮保持不变。

## 当前实现

- web-demo/src/core/threads/stream-contracts.ts：定义 16ms SDK stream throttle，并识别 409、conflict 和 active-run 错误措辞。
- web-demo/src/core/threads/hooks.ts：useStream 使用 throttle: 16；提交固定使用 multitaskStrategy: reject，删除 409 → interrupt 重试。SDK onError 收到 busy 冲突时通过 onBusyConflict(message) 转交原消息；FIFO ref 关联多次提交，避免消息错配。busy 失败不触发失败 stream 的 toast、run 清理或自动中断；活动 run 正常结束后仍可触发队列自动发送。stopThread() 原有显式 cancel/interrupt 路径未改动。
- web-demo/src/components/workspace/chats/use-chat-page-controller.ts：busy 回调和 Promise 409 fallback 共用已有队列，WeakSet 防止同一消息重复入队。
- web-demo/src/components/workspace/chat/message-item.tsx：已完成消息忽略每次流更新生成的 contextMessages 数组引用；仍比较真实 message、编辑/分支/重生成回调和计时对象；活动消息强制继续渲染。
- web-demo/src/components/workspace/chat/message-feed.tsx：会话 turn、tool call、tool result、deliverables 使用可测试的增量去重状态；task 工具调用按 call id 和参数签名去重；ProcessingFlow 使用消息对象身份比较，历史处理流不因上下文数组引用变化重复解析。

## 测试覆盖

- tests/unit/core/messages/conversation-event-dedupe.test.ts
- tests/unit/core/threads/use-thread-stream.test.tsx
- tests/unit/components/workspace/chat/message-item.test.tsx
- tests/unit/components/workspace/chats/use-chat-page-controller.test.tsx

覆盖 busy 排队、无 interrupt、16ms throttle 契约、事件去重、消息比较器边界和控制器既有路由/队列行为。

## 验收命令

在 web-demo 目录运行：

    pnpm run typecheck
    pnpm exec eslint <本次修改文件>
    pnpm vitest run

在仓库根目录运行：

    git diff --check

全仓库 pnpm run lint 仍可能报告与本次无关的历史 import/order 错误和 warning；验收以本次修改文件无新增 error、完整单测通过为准。

## 开发态实测

确认已有 28080/28081 服务后使用现有服务，不执行 stop；若服务未运行，再按项目脚本启动。观察长任务期间：活动消息持续更新、历史消息不闪烁、滚动稳定；发送冲突进入队列且当前 run 不变为 interrupted；点击停止仍能停止任务。
