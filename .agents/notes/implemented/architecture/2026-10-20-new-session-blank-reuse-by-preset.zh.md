# Agent Note: New Session 复用空白 Session，并匹配请求的预设

Status: implemented

[English](2026-10-20-new-session-blank-reuse-by-preset.md) | 中文

## 问题

New Session（侧边栏按钮、Workspace「+」按钮与快捷键都调用不带参数的 `uiWorkspace.startSession`）曾经复用 Workspace 的第一个空白 Session。更早的 0.2.1-alpha.2 变更改为每次调用都创建新的 Session 与 Agent，让 New Session 在用户修改预设后按当前预设定义组合，而不是沿用被复用空白此前的组合。

不在当前的空白 Session 会在 Session 树中隐藏，而 New Session 是回到它的唯一方式。该变更之后，用户向空白 Session 输入草稿、切换到其他 Session、再点 New Session，会落到另一个空 Session；原草稿仍以旧 Session id 存在 localStorage 中，但没有任何控件能回到它。因此该变更丢失了 New Session 的未发送草稿。

Creator 入口（`startSession(…, { agentPreset: 'cordis', prompt, whenDraftExists: 'append' })`）同样复用第一个空白并把它切成 Creator：已有的普通草稿留在 Creator 模式下，Creator 提示词也没能填入；New Session 同样可能接管 Creator 空白。

## 决策

只有客户端（`ui-workspace`）变更；Host 不变：

- 不带参数的 `startSession` 重新走复用路径，并与 `openWorkspace`、`connectWorkspace` 及带参数的 `startSession` 遵循同一规则。
- `connectWorkspace` 选择第一个未开始、未归档且仍是 Workspace 成员的空白 Session，然后通过 `sessions.create({ workspaceId, sessionId })` 请 Host 收养它，由 Host 切换为请求的预设或其默认预设。请求指定预设时，会跳过列出其他预设（`projectionValues.agentPreset`）的空白；未列出预设的空白仍可复用；不带预设的请求可复用任意空白。没有可用空白时由 Host 新建 Session。

由此，New Session 带着未发送草稿回到原空白 Session，Creator 等预设流程也不会接管列出其他预设的空白，普通草稿不会被移到 Creator 下。不新增持久化状态，客户端也不读取预设名册。

## 考虑过的替代方案

**所有请求都复用第一个空白。** 草稿回来了，但 Creator 等预设流程会接管用户普通草稿所在的空白，把它切成 Creator、保留草稿且无法填入自己的提示词。

**仍新建 Session，并把被弃空白的草稿搬过去。** 需要规定存在多个空白时从哪个搬、附件如何处理、旧 Session 是否归档，比复用空白更复杂且引入更多状态。

**不带预设的请求只复用 Host 默认预设的空白。** 客户端不知道默认预设，必须请求 `agentPresets.list()` 名册。

**在客户端记录持久化的来源到空白 Session 映射。** 它与每个空白已记录的预设重复，还要处理陈旧条目与按 origin 隔离。

**预设变化时原地清空已有草稿（`clearPreviousDraft: true`）。** 这会删除用户在另一模式下写的草稿。

## 验证

- `ui-workspace` 单元测试：不带选项的 New Session 回到既有空白；不带预设的请求复用任意空白，带预设的请求只复用列出同一预设的空白，没有匹配时新建 Session（26 例通过）。
- `ui-conversation` 草稿测试：`whenDraftExists` 保留、追加或替换已有草稿；纯附件草稿把追加文本作为完整正文。
- 升级指南[New Session 回到它的空白 Session](../../../../docs/upgrade-guide/v0.2.1-rc.2/new-session-blank-reuse/guide.zh.md)说明用户可见变更与迁移步骤。

## 影响

- New Session 不再保证当前预设定义：若被复用空白的 Agent 仍以同一预设 id 加载在 Host 中，它保留创建时的组合；Host 重启后恢复的空白按当前定义组合。
- 指定预设的客户端请求仍可收养未列出预设的空白；Host 在收养时设置该预设。
