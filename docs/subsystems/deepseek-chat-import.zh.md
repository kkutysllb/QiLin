# DeepSeek 会话导入

[English](deepseek-chat-import.md) | 中文

实验性的 DeepSeek 会话导入层把用户从 chat.deepseek.com 导出的会话作为普通已存储 Session 带进工作区。[`qilin-experimental-deepseek-chat-import`](../../packages/experimental/deepseek-chat-import/README.zh.md) 在 Host 侧提供 `ctx.deepseekChatImport`，在浏览器侧提供侧栏动作；默认关闭的 bundle 从插件页组合这两半。

## 导入流程

浏览器通过仅限 owner 的路由上传 `deepseek_data-*.zip` 压缩包，并展示上传、读取与逐个 Session 写入的进度。Host 不把 ZIP 解到磁盘：读取 `manifest.json` 与 `chat_session_index.json` 后，以流式解析逐条走过最近的会话，内存只随当前条目增长。每个会话成为所选工作区中的已存储 Session：所看分支的消息、思考内容、联网搜索与网页卡片、附件，以及原始标题与时间。被撤回的回答写成错误行并留在模型上下文之外；没有任何可用提问的会话会被跳过。导入直接写 Session 日志、不启动 Agent，因此浏览器在尝试结束后刷新会话列表。

## 限制与访问

一次导入最多写入 `maxSessions` 个会话（默认 1000）、接受不超过 `maxUploadBytes`（512 MiB）的压缩包与不超过 `maxEntryBytes`（256 MiB）的单条目，标题截断到 `maxTitleBytes`（80）。上传路由仅限 owner：共享访客既看不到动作，也无法投递该路由。同一压缩包导入两次会得到每个会话的第二份副本。

## Kylin surface

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

<a id="ctxdeepseekchatimport--deepseekchatimportservice"></a>

### `ctx.deepseekChatImport` — `DeepseekChatImportService`

Serves the owner-only export upload route and the limits the browser checks first.

```ts cordis-catalog
/**
 * Report the limits the browser checks before uploading. Only the owner may
 * import, so every other principal is refused.
 * @param signal - Client cancellation or Remote withdrawal.
 * @returns the largest accepted archive size.
 * @throws {RemoteError} `deepseekChatImport/owner-only` for a caller that is not the owner.
 */
@Remote limits(signal: AbortSignal): DeepseekChatImportLimits
```

Source: [`packages/experimental/deepseek-chat-import/src/index.ts`](../../packages/experimental/deepseek-chat-import/src/index.ts)
<!-- END GENERATED kylin-surface -->
