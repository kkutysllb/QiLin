---
kind: upgrade-guide
description: "New Session 重新复用 Workspace 中的空白 Session，而不是每次都创建新的 Agent。"
---

# New Session 回到它的空白 Session

[English](guide.md) | 中文

## 变更

更早的 0.2.1 预览版让 Web 与桌面端的 New Session，以及不带参数的 `uiWorkspace.startSession(workspaceId)`，在每次调用时都创建新的 Session 与 Agent。被留下的空白 Session 在 Session 树中隐藏，其未发送的草稿再也无法找回。

现在 New Session 复用 Workspace 中第一个未开始、未归档的空白 Session；Host 收养该空白 Session 并切换为请求的预设或其默认预设，只有在没有可用空白时才新建 Session。带参数的 `startSession`、`openWorkspace` 与 `connectWorkspace` 遵循同一规则；请求若指定 Agent 预设，会跳过列出其他预设的空白，因此 Creator 等预设流程不会接管其他预设的草稿。

被复用的空白 Session 若其 Agent 仍已加载，会保留创建时的预设组合。New Session 不再保证使用当前预设定义。

## 迁移

1. 修改预设定义后，请在 Agent 于该变更之后组合的 Session 中开始对话；例如先重启 Host 再使用 New Session——重启后恢复的空白会按当前定义组合。
2. 不得接管列出其他预设的空白的客户端集成，请向 `startSession`、`openWorkspace` 或 `connectWorkspace` 传入 `{ agentPreset }`。
3. 验证：New Session 后输入草稿，打开另一个 Session，再次 New Session：同一个空白带着草稿打开。
