# Agent Note: 从浏览器保存工作区文件

Status: implemented

[English](2026-09-14-workspace-file-save.md) | 中文

## 问题

Web 客户端能读工作区文件，却从来不能写。`ctx.workspaceFiles` 暴露 `stat`、`read`、`readBytes`、`readAll`、`readRelated`、`list` 与 `changes`，而 `packages/api` 里没有任何东西会改动文件：客户端可达的改动只有会话与工作区记录、一次受能力门控的目录创建，以及设置文档。Host 的写能力 `ctx.fs.writeText` 是仅存在于 Host 的 Cordis 服务，没有线上接口。没有保存，编辑器 tab 就毫无意义，因此文件工作台在此之前无法发布。

## 决策

`remote.workspaceFiles.write(scopeId, path, text, { baseVersion? })` 在写入之后返回该文件的 `WorkspaceFileStat`。它复用读取路径的包含性检查，而不是再长出一套：先探测该条目再解析路径，非文件条目以 `workspace-file/not-regular-file` 拒绝，解析后的目标必须留在会话工作区内，否则以 `workspace-file/outside-workspace` 拒绝。文本受既有的、已校验的 `maxFileBytes` 约束。

**新鲜度是调用方的令牌，不是 Agent 的观察。** 保存不派发 `fs/write-intent`。该 waterfall 从 Agent 自己的读取记录推导意图：未被观察过的文件得到 `createIfAbsent`，而提供方对已存在的文件会拒绝它，因此委派过去会让每一次覆盖都失败。改为传入 Agent 的身份更糟——它会把用户自己的编辑记进 Agent 的观察台账，而 Agent 的下一次编辑会对一个它从未读过的版本做比较并交换。因此 `baseVersion` 直接成为提供方的守卫 `replaceIfVersion`，省略令牌即无条件写入。令牌是不透明的：只做相等比较，绝不解析也不排序。

写入成功后服务发出不带 actor 的 `fs/observed`，因此变更流把新版本发布给其它读者，而观察策略什么都不记录。写入在每次调用的 `{ mode: 'workspace-write', workspaceRoot }` 策略下运行，其根就是该服务已经限定过的工作区，因为后端在无会话时的默认值会解析到部署根，从而拒绝该服务刚刚接受的路径。

## 考虑过的替代方案

- **派发 `fs/write-intent`**——见上；它颠倒了观察记录的含义。
- **把 `readAll`/`writeText` 暴露为一次读-改-写调用**——它会把新鲜度决策藏进 Host，而重试策略本就属于编辑器。
- **为写入上限新增配置字段**——`maxFileBytes` 已经界定同一文件的完整读取，而写入不可能让文件长过一个读取会拒绝的大小。

## 后果

- 沙箱模式为只读的会话仍然允许浏览器保存：这次保存的权威是用户自己的工作区边界加上新鲜度令牌，而不是会话的 Agent 策略。要收紧它，需要在这次调用处加一个 `sandboxPolicy.resolve(session)` 检查。
- 编辑器的冲突路径是客户端的：`workspace-file/stale` 保留用户已写的文本，并提供重新加载或覆盖。

## 验证

- `packages/api/workspace-files/tests/write.spec.ts` 覆盖受守卫的写入、拒绝陈旧且文件保持不变的路径、无条件写入、包含性逃逸、符号链接与目录拒绝、恰好达到与超过上限的大小限制，以及不咨询 `fs/write-intent`。
- 文件工作台自己的 spec 覆盖保存动作、脏状态与冲突决策。

## 延后事项

- 没有浏览器场景通过真实 Host 保存文件并重新读回。
- 上述只读会话行为只是陈述，尚未测试。
