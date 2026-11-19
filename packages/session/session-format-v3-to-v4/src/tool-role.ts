/** First-class tool-role messages in the V4 representation. */

import { SessionFormatError, SessionFormatUnsupportedMigrationError, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatJsonValue } from '@qilin-agent/session-format'

const WRAPPER_FIELDS = new Set(['type', 'toolCallId', 'content', 'isError'])
const MESSAGE_FIELDS = new Set(['id', 'role', 'source', 'content'])

/** Preserve unknown fields without merging their original message and result owners. */
function extensionFields(
  value: Record<string, SessionFormatJsonValue>, fields: ReadonlySet<string>, owner: 'message' | 'result',
): Record<string, SessionFormatJsonValue> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.has(key))
    .map(([key, field]) => [`plugin:${owner}:${key}`, field]))
}

function resultContent(value: SessionFormatJsonValue | undefined, subject: string): SessionFormatJsonValue[] {
  if (!Array.isArray(value)) throw new SessionFormatError(`${subject} tool-result content must be an array`)
  if (value.some(block => isSessionFormatJsonObject(block) && block['type'] === 'tool-result')) {
    throw new SessionFormatUnsupportedMigrationError(
      `${subject} contains a nested tool-result unsupported by this converter`,
    )
  }
  return value as SessionFormatJsonValue[]
}

/**
 * Lift one released-V3 wrapper tool/result row into the first-class V4 message.
 * Validate the wrapper before dropping it so malformed historical content is
 * rejected instead of being silently truncated.
 * @param event - released wrapper tool/result event.
 * @returns the same event with a first-class tool-role message.
 * @throws {SessionFormatError} when the wrapper, tool source, content, or error flag is malformed.
 * @throws {SessionFormatUnsupportedMigrationError} when the result contains another result.
 */
export function liftToolResult(event: SessionFormatEvent): SessionFormatEvent {
  if (event.type !== 'tool/result' || !isSessionFormatJsonObject(event.data)) return event
  const data = event.data
  const message = data['message']
  if (!isSessionFormatJsonObject(message) || message['role'] !== 'user') return event
  const source = message['source']
  const callId = isSessionFormatJsonObject(source) ? source['callId'] : undefined
  const content = message['content']
  const block = Array.isArray(content) && content.length === 1
    ? (content as readonly SessionFormatJsonValue[])[0]
    : undefined
  const wrapper = isSessionFormatJsonObject(block) ? block : undefined
  const id = message['id']
  if (typeof id !== 'string' || id.length === 0
    || !isSessionFormatJsonObject(source) || source['kind'] !== 'tool'
    || typeof callId !== 'string' || callId.length === 0
    || wrapper === undefined || wrapper['type'] !== 'tool-result'
    || wrapper['toolCallId'] !== callId) {
    throw new SessionFormatError(`format v3 ${event.type} at seq ${event.seq} requires exactly one tool-result wrapper matching its tool source`)
  }
  const isError = wrapper['isError']
  if (isError !== undefined && typeof isError !== 'boolean') {
    throw new SessionFormatError(`format v3 ${event.type} at seq ${event.seq} tool-result isError must be boolean`)
  }
  const targetMessage: Record<string, SessionFormatJsonValue> = {
    role: 'tool',
    source,
    toolCallId: callId,
    content: resultContent(wrapper['content'], `format v3 ${event.type} at seq ${event.seq}`),
    ...(isError === undefined ? {} : { isError }),
    id,
    ...extensionFields(message, MESSAGE_FIELDS, 'message'),
    ...extensionFields(wrapper, WRAPPER_FIELDS, 'result'),
  }
  return { ...event, data: { ...data, message: targetMessage } }
}

/**
 * Adopt `source.callId` as the authoritative tool-call link.
 *
 * A retried or recovered turn can persist a tool/result whose message carries a
 * stale/empty `toolCallId` while `source.callId` still names the call event.
 * The engine links results by `source.callId` (scheduler, UI replay, repair), so
 * normalize that field before admission instead of failing the whole turn.
 * @param event - untrusted event or physical row.
 * @returns the same value when already consistent, otherwise a shallow-copied event.
 */
export function normalizeV4ToolResultCallIds<T>(event: T): T {
  if (!isSessionFormatJsonObject(event) || event['type'] !== 'tool/result') return event
  const data = event['data']
  if (!isSessionFormatJsonObject(data)) return event
  const message = data['message']
  if (!isSessionFormatJsonObject(message)) return event
  const source = message['source']
  if (!isSessionFormatJsonObject(source)) return event
  // Fork 的 not-started 结果用 id 编码身份（fork-result.ts 专门校验），不能改写。
  const error = data['error']
  if (isSessionFormatJsonObject(error) && error['code'] === 'TOOL_NOT_STARTED'
    && typeof message['id'] === 'string' && message['id'].startsWith('forked-tool-result-')) return event
  const callId = source['callId']
  if (typeof callId !== 'string' || callId === '') return event
  if (message['toolCallId'] === callId) return event
  return { ...event, data: { ...data, message: { ...message, toolCallId: callId } } } as T
}

const SOURCE_TOOL_NAME_KEYS = ['name', 'toolName', 'tool_name'] as const

function sourceToolName(source: SessionFormatJsonValue | undefined): string {
  if (!isSessionFormatJsonObject(source)) return 'unknown'
  for (const key of SOURCE_TOOL_NAME_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return 'unknown'
}

/**
 * Validate the native V4 first-class tool-role message of one tool/result row.
 * @param event - canonical V4 event.
 * @throws {SessionFormatError} when the row is not an exact first-class tool result.
 */
export function assertV4ToolResultMessage(event: SessionFormatEvent): void {
  if (event.type !== 'tool/result') return
  const subject = `format v4 ${event.type} at seq ${event.seq}`
  const data = event.data
  if (!isSessionFormatJsonObject(data)) throw new SessionFormatError(`${subject} data must be an object`)
  const message = data['message']
  if (!isSessionFormatJsonObject(message)) throw new SessionFormatError(`${subject} message must be an object`)
  const id = message['id']
  const role = message['role']
  const toolCallId = message['toolCallId']
  const source = message['source']
  const isError = message['isError']
  const content = message['content']
  const sourceCallId = isSessionFormatJsonObject(source) ? source['callId'] : undefined
  if (typeof id !== 'string' || id.length === 0) {
    throw new SessionFormatError(`${subject} requires a first-class message with a string id`)
  }
  if (role !== 'tool') throw new SessionFormatError(`${subject} requires a tool-role message`)
  if (typeof toolCallId !== 'string' || toolCallId.length === 0 || sourceCallId !== toolCallId) {
    // 带 tool 名与两个 id、turn/step：只有 seq 时线上无法定位是哪条结果。
    const turn = data['turn'] === undefined ? '?' : String(data['turn'])
    const step = data['step'] === undefined ? '?' : String(data['step'])
    throw new SessionFormatError(
      `${subject} requires toolCallId matching its tool source `
      + `(tool=${sourceToolName(source)}, toolCallId=${JSON.stringify(toolCallId)}, `
      + `source.callId=${JSON.stringify(sourceCallId)}, turn=${turn}, step=${step})`,
    )
  }
  if (!isSessionFormatJsonObject(source) || source['kind'] !== 'tool') {
    throw new SessionFormatError(`${subject} requires a tool source`)
  }
  if (!Array.isArray(content)) throw new SessionFormatError(`${subject} requires array content`)
  if (content.some(block => isSessionFormatJsonObject(block) && block['type'] === 'tool-result')) {
    throw new SessionFormatError(`${subject} content must not contain a released tool-result wrapper`)
  }
  if (isError !== undefined && typeof isError !== 'boolean') {
    throw new SessionFormatError(`${subject} isError must be boolean when present`)
  }
  if (data['error'] !== undefined && isError !== true) {
    throw new SessionFormatError(`${subject} carries error metadata for a non-error tool result`)
  }
}
