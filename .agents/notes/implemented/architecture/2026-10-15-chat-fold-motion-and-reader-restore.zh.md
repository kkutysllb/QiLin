# Agent Note：折叠只走一次动作，fork 的读者复位保留

Status: implemented

[English](2026-10-15-chat-fold-motion-and-reader-restore.md) | 中文

## 问题

当某个 Turn 的工作过程在收到下一条消息时收起，对话滚动层会走两条折叠路径。输入路径量出正在收起的行，并在同一个帧时钟上把这些行与滚动视口一起移到唯一落点。generic 路径保持 scrollTop 不动，把整段收起高度一次性预留成底部空间，折叠结束后再跟随一次——它只在折叠发生在读者下方时成立。本页没有 transcript echo 的人类输入全都走 generic 路径（别的标签页发送、排队消息在上一个 Turn 之后投递、右栏子智能体 composer 发送），于是停在底部的读者眼看着预留空间填满视口，停在中间的读者眼看着自己的内容整体上移。

## 决定

`packages/client/ui-chat` 采用上游 DSH 的**一次折叠动作**。[flow-motion.ts](../../../../packages/client/ui-chat/src/client/chat/flow-motion.ts) 把每一批正在收起的行交给 viewport 提供的 `InputFoldDriver`，其四步为 begin（量盒并选定落点）、prepare（在写盒高之前先涨 room，避免中间帧被夹取）、frame（同帧写盒高与 scrollTop）、finish（落地最终 room）。[use-chat-viewport.ts](../../../../packages/client/ui-chat/src/client/chat/use-chat-viewport.ts) 在批开始时二选一：本客户端自己的输入或原本就在跟随尾部的读者落在**尾部**；其余落在 **reader content still**——取第一个不在批内的可见顶层行作参考，按其测得的位移补偿 scrollTop。两种落点都只装差额 room：`max(0, target + viewport 高 − 折叠后高度)`。generic 路径被删除，`reserveBelow`、`pendingReserve`、`pendingGrowth` 与 `followAfterFold` 随之一并消失。

fork 自己的读者复位保留在上层，因为它回答的是另一个问题。[ChatViewport.restoreReaderRow](../../../../packages/client/ui-chat/src/client/chat/use-chat-viewport.ts) 在**非折叠**造成的布局变化之后（图片加载完成、内容增长）把已定住的读者行放回其采样偏移；`consumeResize`/`consumeReaderIntent` 让 [ChatReading](../../../../packages/client/ui-chat/src/client/chat/use-chat-reading.ts) 分辨读者自己的滚动与浏览器的重排补偿。上游机制只在折叠批内测量位移，故两者并存：折叠经 driver 落点，非折叠布局位移经 `restoreReaderRow` 复位。二者在 `ChatReading.flushSample` 与 `commit` 汇合，为随后运行的那条路径记录读者位置。

接线无需改动。`createFlowMotion` 只由 viewport 调用，driver 自洽；`apply.ts`、`contract/slots.ts`、`ChatView.tsx`、`ChatFlow.tsx` 保持 fork 结构。

## 备选方案

**保留 generic 路径，只修 own-input 判定。** 上游先于本 fork 否决：两条路径的几何规则会继续分叉，且非 own input 仍会把跟随中的读者留在预留空间上。

**不要 driver，改按读者位置补偿 generic 路径。** 补偿与 room 算术会存在两份并再次分叉；没有帧时钟，浏览器会在 room 与盒高写入之间夹取一个中间帧。

**放弃 fork 的读者复位，交给折叠机制。** 下列 spec 断言的正是非折叠造成的布局变化；上游落点只在批内测量，放弃它会让读者停在远离尾部时的内容增长与图片加载回退。

## 后果

任何输入下，跟随中的读者落在底部；停在中间的读者内容保持不动；装入的 room 只是落点所缺的部分，故短正文可能留下缺口，直到新内容填满。两条机制现在都会写滚动位置，改任一条都必须经过同一次 reading 采样。

## 测试

[`fold-follow.client.spec.ts`](../../../../packages/client/ui-chat/tests/fold-follow.client.spec.ts) 覆盖批、两个落点与 room 算术；[`chat-scroll.client.spec.tsx`](../../../../packages/client/ui-chat/tests/chat-scroll.client.spec.tsx) 通过 `useChatScroll` 覆盖接线；`flow-motion.client.spec.tsx` 覆盖动效；`chat-viewport.client.spec.ts`、`chat-reading-navigation.client.spec.ts`、`chat-view.client.spec.tsx` 覆盖布局变化后的读者复位。`pnpm run test:gui` 运行它们。

## 关联

- [上游 0.2.1-alpha.3 对齐计划](../../../../plans/2026-10-15-upstream-0.2.1-alpha.3-alignment.md) —— 本次移植所属窗口，以及它延后的部分（浏览器空白矩阵与子智能体 echo 接线）。
