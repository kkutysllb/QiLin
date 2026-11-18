# DeepSeek chat import

English | [中文](deepseek-chat-import.zh.md)

The experimental DeepSeek chat import layer brings the conversations a person exported from chat.deepseek.com into a Workspace as ordinary stored Sessions. [`qilin-experimental-deepseek-chat-import`](../../packages/experimental/deepseek-chat-import/README.md) provides `ctx.deepseekChatImport` on the Host and the sidebar action in the browser; the default-disabled bundle composes both halves from the Plugins page.

## Import pipeline

The browser uploads the `deepseek_data-*.zip` archive through an owner-only route and shows upload, reading, and per-Session write progress. The Host opens the ZIP without extracting it to disk, reads `manifest.json` and `chat_session_index.json`, then walks the most recent conversations through a streaming parser that keeps memory bounded by archive entry. Each conversation becomes a stored Session in the chosen Workspace: the selected branch's messages, their reasoning, web search and page cards, attachments, and original titles and times. Withdrawn replies are written as an error row and stay out of model context; a conversation with no usable question is skipped. The import writes Session logs directly and never starts an Agent, so the browser refreshes the Session list after the attempt.

## Limits and access

One import writes at most `maxSessions` conversations (1000 by default), accepts at most `maxUploadBytes` (512 MiB) per archive, at most `maxEntryBytes` (256 MiB) per archive entry, and truncates titles to `maxTitleBytes` (80). The upload route is owner-only: a shared guest sees no action and cannot post the route. Importing the same archive twice creates a second copy of every conversation.

## Kylin surface

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

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
