# 检查器

[English](inspector.md) | 中文

[`@qilin-agent/experimental-inspector`](../../packages/experimental/inspector/README.zh.md)把一条 Chrome DevTools 连接接到运行中的 QiLin Host 与每个已连接的浏览器 Client。两个插件面提供同一个 `ctx.inspector` 服务：`publish()` 承载各 realm 的观察数据，`cordis.getTree()` 读取共享的 Cordis 拓扑。所有 Chrome DevTools Protocol 状态都放在 Worker 页面目标中；Host 与 Client 代码发布内部观察记录，Worker 把识别出的 topic 翻译成协议域。

## 运行时布局

Host 插件注入 `webServer` 与 `connection`，启动 Worker，并持有指向它的专用 `MessagePort`。Worker 在 `127.0.0.1` 上提供协议端点，持有来源状态与保留，并为每条 DevTools 连接向 Host 主线程附加私有 `node:inspector.Session`，因此 Host JavaScript 暂停时仍可调试 Host。Client 用启动参数直接向 Worker 打开已认证的 WebSocket；启动参数或由 Host 注入，或经 Host 在启动 Worker 之前注册的已认证路由获取。Client 从不收到 DevTools URL。

生产者发送内部观察记录——来源代号、序号、来源时钟时间戳、topic、JSON 载荷——Worker 校验每个进程与网络帧后翻译识别出的 topic。Client 来源声明带类型的 Runtime、Console 与只读 Sources 能力。`Runtime.enable` 发布默认 Host 执行上下文，并为该 DevTools 连接包含的每个已连接 Client 发布一个合成上下文；选中某个 Client 上下文后，求值、属性访问、函数调用、Promise 等待与对象释放都路由到该浏览器 realm。不支持 Client 脚本断点、单步与调用栈，目标级暂停与恢复只控制 Host 调试器。

当平台无法运行 Worker 并报出 Node 的 `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` 时，Host 记录一条警告，只带 bootstrap 路由启动，该路由回答 `503`：没有 `ctx.inspector`、DevTools 路由、bootstrap 注入或 `devtools://` URL。其他启动错误仍会拒绝该插件。晚加载的 Client 的 bootstrap 请求等待 Worker 就绪，启动失败时收到 `503`。Client 在 `pagehide` 时同步关闭来源，并在 `pageshow`（含缓存页恢复）后以同一逻辑身份重连；把活动页面切到后台不会断开连接。

## 观察 API

`ctx.inspector.publish(topic, payload, monotonicMs?)` 校验无损 JSON，并调度投递而不等待 Worker，因此被观察的应用操作从不会被延迟。每个来源有界队列；溢出报告为序号缺口。`ctx.inspector.cordis.getTree()` 读取 Worker 最新的独立语义快照，不创建会话，也不启用 Runtime、Debugger 或 Sources；两个面提供同一个读取器。[配置目录](../config-catalog.zh.md#qilin-agentexperimental-inspector)列出每个可接受的 Host 字段及其声明。

## Cordis 树检查

两个面运行同一个浏览器安全的 Cordis 收集器，它把可达的 Context 与 Fiber 对象转换为带版本的 `CordisTreeSnapshot`；Worker 保存该与协议无关的表示，并把每个 Host 或 Client 来源投影到 Elements 面板。Elements 文档有固定的 `<host>` 与 `<clients>` 容器：`<host>` 承载 Host 根 Context，`<clients>` 承载每个来源的 `<client>` 及其 realm 根 Context。Cordis 根 Fiber 被省略；其他每个 Fiber 都是 `fiber.parent` 的子节点，为 `fiber.ctx` 拥有且仅拥有一个 Context 子节点，并只携带 `uid`；Context 元素没有属性。Context 与 Fiber 节点携带用于 realm 本地对象查找的不透明句柄，Fiber 节点还携带 Cordis `uid`，Worker 把各 realm 快照组合成一棵 `{ host, clients }` 树。

节点投递按 DevTools 连接限制深度：省略 `depth` 时 `DOM.getDocument` 提供三层文档，被扣留的层公布 `childNodeCount`，并通过 `DOM.requestChildNodes` 获取；展开已知节点只投递尚未发送的子列表，因此既有前端节点与更深的已加载后代保持稳定。来源发布完整快照，Worker 在通知 DevTools 前比较稳定的后端节点身份，因此未变化的快照不产生 DOM 事件。`DOM.resolveNode` 向所属 Host 或 Client Runtime 请求连接本地对象 id，`DOM.requestNode` 再把该对象映射回同一个 Elements 节点。断开的 Client 立即失去其 Console 上下文与活动对象 id；启用断开树保留时，最后一棵树保留下来，其 `<client>` 元素携带 `disconnected`，直到新传输代次的完整快照替换它。

## Host fetch 捕获

fetch 捕获包装 `globalThis.fetch`，记录完整 URL、请求与响应头、正文前缀、状态、耗时、错误与取消，不脱敏凭据、cookie、查询值或载荷。配置的正文上限约束保留量而不是挑选字段：捕获保留前缀并把记录标记为已截断，`Network.getRequestPostData` 与 `Network.getResponseBody` 读取 Worker 保留的字节。直接调用 Undici `Client` 与 `Dispatcher`，以及插件激活前保留的 fetch 引用，都不在该观察器范围内。

## 安全性

该协议目标通过 `Runtime.evaluate` 授予 Host 与每个已连接 Client realm 任意代码执行能力，fetch 捕获又包含机密，因此 Worker 只接受 `127.0.0.1` 绑定地址。Client 摄取还要求 Host 注入的随机 WebSocket 子协议令牌，并拒绝非回环来源，除非 `clientOrigins` 点名；CDP 套接字本身没有令牌，回环绑定是它唯一的访问控制。Client 选择只限制一条 DevTools 连接的 realm 会话、DOM 投影与诊断查询；它是显示过滤器，不是授权，Host 求值保留原有权限。

## 开发者工具包

[开发者工具包](../../packages/experimental/inspector-profile/README.zh.md)一并启用本检查器、Host fetch 捕获与 [Session Inspector](../../packages/experimental/session-inspector/README.zh.md) 的侧边栏页面。该包默认关闭。

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

<a id="ctxinspector--inspectorservice"></a>

### `ctx.inspector` — `InspectorService`

Shared Host/Client service façade over the realm's source publisher.

```ts cordis-catalog
/**
 * Publish one JSON observation without waiting for Worker delivery.
 * @param topic - Domain-owned topic name.
 * @param payload - JSON value validated before it reaches the carrier.
 * @param monotonicMs - Source-clock timestamp; defaults to `performance.now()`.
 */
publish(topic: string, payload: InspectorJsonValue, monotonicMs?: number): void
```

Types: [InspectorJsonValue](extensions.zh.md)

Source: [`packages/experimental/inspector/src/index.ts`](../../packages/experimental/inspector/src/index.ts)
<!-- END GENERATED kylin-surface -->
