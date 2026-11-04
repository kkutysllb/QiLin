/**
 * Keyless snapshot coverage for the TypeScript SDK path: each scenario spawns
 * the real `qilin --profile sdk` runtime through
 * `@qilin-agent/sdk-client`, drives recorded turns and standalone commands over stdio JSON-RPC,
 * and pins the SDK `RunResult`, the complete notification stream, and the
 * persisted session logs. Replay serves recorded model
 * responses via `llm-replay` (`cordis.snapshot.yml`); `QILIN_SNAPSHOT=record`
 * re-records against the live API; `QILIN_SNAPSHOT=refresh` replays committed
 * fixtures and rewrites expected outputs.
 */

import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertPersistedSessionVersion,
  assertSessionFixtureVersion,
  captureExpectedWorkspaceSnapshot,
  captureWorkspaceSnapshot,
  normalizeSessionFormatMetadata,
  normalizeSessionLog,
  normalizeSessionSnapshots,
  normalizeStdout,
  normalizedHeaders,
  normalizedSystemPrompts,
  normalizedToolSchemas,
  parseSnapshotManifest,
  parseToolSchemasSnapshot,
  redactSessionSnapshotIds,
  refreshFixtureReplacements,
  restorePinnedToolSchemas,
  scrubModelRequestBulk,
  scrubSessionSnapshot,
  sessionFixtureName,
  systemPromptPrecedesRequests,
  sessionFixtureNames,
  sessionHeaderVersion,
  writerSnapshotName,
  stabilizeFixtureMessageIds,
  stabilizeRefreshLog,
  tokenizeSessionFixtureCwd,
  writesCurrentSessionFixtures,
  materializeProfilePatch,
  formatSystemPromptSnapshot,
  formatToolSchemasSnapshot,
  latestPersistedSessionPaths,
  type HarvestedLog,
  type NormalizeContext,
  type SnapshotManifest,
  type WorkspaceSnapshotEntry,
} from '@qilin-agent/session-snapshot'
import {
  DeepSeekHarness,
  type HarnessNotification,
  type NotificationSubscription,
  type RunResult,
  type SdkPromptContentBlock,
  type SdkUserQuestionRequest,
  type SdkUserQuestionResult,
} from '@qilin-agent/sdk-client'
import { SESSION_FORMAT_VERSION } from '@qilin-agent/session'

const corpusRoot = fileURLToPath(new URL('../', import.meta.url))

const MINIMAL_SYSTEM_PROMPT = 'You are the environment-selected minimal software engineer.'
/** The minimal prompt plus the composed file-reference guidance, as the replay assembles it. */
const MINIMAL_SYSTEM_PROMPT_COMPOSED = (await readFile(
  new URL('./persistent-tools/system-prompt.expected.md', import.meta.url),
  'utf8',
)).trimEnd()
const MINIMAL_BASH_DESCRIPTION = `Run commands in a bash shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* You don't have access to the internet via this tool.
* You do have access to a mirror of common linux and python packages via apt and pip.
* State is persistent across command calls and discussions with the user.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.`

const mode = process.env.QILIN_SNAPSHOT ?? 'replay'
const recording = mode === 'record'
const refreshing = mode === 'refresh'
const sessionWriteMode = recording ? 'record' : refreshing ? 'refresh' : 'replay'
const RUNTIME_WORKSPACE_ENTRIES = [
  '.agents',
  '.child-qilin',
  '.qilin',
  '.qilin-sdk-background-release',
  '.replay-fixtures',
  '.snapshot-patches',
] as const
const qilinSdkDiagnosticChildPatch = fileURLToPath(new URL(
  './subagent-qilin-sdk-diagnostic/child.cordis.yml',
  import.meta.url,
))
const qilinSdkChildConfig = fileURLToPath(new URL(
  '../../packages/subagent/subagent-qilin-sdk/tests/fixtures/loader/child.patch.yml',
  import.meta.url,
))

interface SdkAssertions {
  /** Additional profile patches applied after the shared composition. */
  patches?: readonly string[]
  /** Captured model-request JSONL filename under this scenario's private QILIN home. */
  modelRequestsFile?: string
  /** Replay caller-owned commands between turns; profile fixtures own any in-turn commands. */
  replayStandaloneCommands?: boolean
  /** Submit all manifest images with each standalone command, including rejected invocations. */
  commandAttachments?: boolean
  /** Native plan-review choices in the order the fixture requests them. */
  planReviews?: readonly ('keep' | 'approve' | 'dismiss')[]
  /** Final response required from a completed turn before updating goldens. */
  expectedFinalResponse?: string
  /** Environment overrides passed to the runtime subprocess. */
  environment?: Readonly<Record<string, string>>
  /** A separate QILIN SDK child whose persisted session joins the evidence. */
  qilinSdkChild?: {
    /** Profile patch materialized for the child runtime. */
    config: string
    /** Exact request configuration committed by the child runtime. */
    agentConfig: Readonly<Record<string, unknown>>
  }
  /** Assembled model-facing tool names and required argument keys. */
  expectedTools?: Readonly<Record<string, readonly string[]>>
  /** Exact assembled system prompt for the root request. */
  expectedSystem?: string
  /** Exact model-facing descriptions for selected tools. */
  expectedToolDescriptions?: Readonly<Record<string, string>>
  /** Expected runtime-context state in the real assembled request. */
  runtimeContext?: false | { includes: readonly string[]; excludes: readonly string[] }
  /** Route for a curated scenario whose recording carries no request record. */
  route?: { readonly provider: string; readonly model: string }
}

const SDK_ASSERTIONS: Readonly<Record<string, SdkAssertions>> = {
  'tool-scheduler-recovery': {
    patches: [fileURLToPath(new URL('./tool-scheduler-recovery/runtime.cordis.yml', import.meta.url))],
  },
  'tool-error-details': {
    patches: [fileURLToPath(new URL('./tool-error-details/runtime.cordis.yml', import.meta.url))],
    expectedFinalResponse: 'ERROR_DETAILS_OK',
  },
  'ptc-turn': {
    patches: [fileURLToPath(new URL('./ptc-turn/runtime.cordis.yml', import.meta.url))],
    expectedFinalResponse: 'CODE_ONE+CODE_TWO',
    expectedTools: { run_code: ['description', 'code'] },
  },
  'manual-compact': {
    expectedFinalResponse: 'SDK_COMPACT_OK',
    patches: [fileURLToPath(new URL('./manual-compact/capture.cordis.yml', import.meta.url))],
    modelRequestsFile: 'compact-requests.jsonl',
    replayStandaloneCommands: true,
  },
  'permission-switch': {
    expectedFinalResponse: 'SDK_PERMISSION_OK',
    environment: { QILIN_PERMISSION_MODE: 'danger-full-access' },
    patches: [fileURLToPath(new URL('./permission-switch/capture.cordis.yml', import.meta.url))],
    modelRequestsFile: 'permission-requests.jsonl',
    replayStandaloneCommands: true,
  },
  'command-identity': {
    expectedFinalResponse: 'SDK_PERMISSION_OK',
    environment: { QILIN_PERMISSION_MODE: 'danger-full-access' },
    patches: [fileURLToPath(new URL('./command-identity/runtime.cordis.yml', import.meta.url))],
    modelRequestsFile: 'command-identity-requests.jsonl',
    replayStandaloneCommands: true,
  },
  'plan-review': {
    expectedFinalResponse: 'SDK_PLAN_OK',
    environment: { QILIN_PERMISSION_MODE: 'workspace-write' },
    patches: [fileURLToPath(new URL('./plan-review/capture.cordis.yml', import.meta.url))],
    modelRequestsFile: 'plan-requests.jsonl',
    replayStandaloneCommands: true,
    planReviews: ['keep', 'approve', 'dismiss'],
  },
  'goal-rounds': {
    environment: { QILIN_PERMISSION_MODE: 'workspace-write' },
    patches: [fileURLToPath(new URL('./goal-rounds/capture.cordis.yml', import.meta.url))],
    modelRequestsFile: 'goal-requests.jsonl',
    replayStandaloneCommands: true,
  },
  'command-attachments': {
    environment: { QILIN_PERMISSION_MODE: 'workspace-write' },
    patches: [fileURLToPath(new URL('./command-attachments/capture.cordis.yml', import.meta.url))],
    modelRequestsFile: 'command-attachment-requests.jsonl',
    replayStandaloneCommands: true,
    commandAttachments: true,
  },
  'subagent-continuable': {
    environment: { QILIN_SNAPSHOT_HUMAN_STEER: '1' },
  },
  'subagent-spawn-in-process': {
    patches: [fileURLToPath(new URL('./subagent-spawn-in-process/hold-child.cordis.yml', import.meta.url))],
  },
  'subagent-qilin-sdk-diagnostic': {
    environment: { QILIN_TEST_CHILD_PATCH: qilinSdkDiagnosticChildPatch },
  },
  'persistent-tools': {
    environment: { QILIN_SYSTEM_PROMPT: MINIMAL_SYSTEM_PROMPT },
    expectedTools: {
      bash: ['command'],
      sidebar_open: [],
      str_replace_editor: ['command', 'path'],
      working_directory: [],
    },
    expectedSystem: MINIMAL_SYSTEM_PROMPT_COMPOSED,
    expectedToolDescriptions: { bash: MINIMAL_BASH_DESCRIPTION },
    runtimeContext: {
      includes: ['Current QILIN file policy: danger-full-access', 'Approval prompts are disabled in this session'],
      excludes: ['workspace-write'],
    },
  },
  'subagent-qilin-sdk-dynamic-route': {
    environment: { QILIN_TEST_PARENT_PROVIDER: 'deepseek-official' },
    qilinSdkChild: {
      config: qilinSdkChildConfig,
      agentConfig: {
        provider: 'mock',
        model: 'mock-routed',
        reasoningEffort: 'max',
        maxTokens: 777,
      },
    },
  },
}

interface CorpusScenario {
  readonly key: string
  readonly name: string
  readonly dir: string
  readonly manifest: SnapshotManifest & {
    composition: string
    recording: 'live' | 'authored'
    header: NonNullable<SnapshotManifest['header']>
  }
}

async function collectCorpus(): Promise<CorpusScenario[]> {
  const scenarios: CorpusScenario[] = []
  for (const profile of ['session', 'sdk']) {
    const root = join(corpusRoot, profile)
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(root, entry.name)
      const manifestPath = join(dir, 'snapshot.yml')
      if (!existsSync(manifestPath)) continue
      const manifest = parseSnapshotManifest(await readFile(manifestPath, 'utf8'), manifestPath)
      if (manifest.composition === undefined || manifest.recording === undefined || manifest.header === undefined) continue
      scenarios.push({
        key: `${profile}/${entry.name}`,
        name: entry.name,
        dir,
        manifest: { ...manifest, composition: manifest.composition, recording: manifest.recording, header: manifest.header },
      })
    }
  }
  return scenarios
}

const corpus = await collectCorpus()
const scenarioByKey = new Map(corpus.map(scenario => [scenario.key, scenario]))
const sdkScenarios = corpus
  .filter(scenario => scenario.manifest.profile === 'sdk')
  .sort((left, right) => left.name.localeCompare(right.name))
const compositionOwners = new Map<string, CorpusScenario>()
const headerPins = new Map<string, CorpusScenario>()
for (const scenario of corpus) {
  const { composition, header } = scenario.manifest
  if (existsSync(join(scenario.dir, 'cordis.yml'))) {
    if (compositionOwners.has(composition)) throw new Error(`snapshot composition ${composition} has multiple patch owners`)
    compositionOwners.set(composition, scenario)
  }
  if (header.pin === true) {
    const key = `${composition}/${header.class}`
    if (headerPins.has(key)) throw new Error(`snapshot header class ${key} has multiple pins`)
    headerPins.set(key, scenario)
  }
}

function compositionOwner(scenario: CorpusScenario): CorpusScenario {
  const owner = compositionOwners.get(scenario.manifest.composition)
  if (owner === undefined) throw new Error(`${scenario.key}: composition has no cordis.yml owner`)
  return owner
}

function headerPin(scenario: CorpusScenario): CorpusScenario {
  const pin = headerPins.get(`${scenario.manifest.composition}/${scenario.manifest.header.class}`)
  if (pin === undefined) throw new Error(`${scenario.key}: composition/header class has no pin`)
  return pin
}

function sourceScenario(owner: CorpusScenario, source: string | undefined): CorpusScenario {
  const key = source === undefined
    ? owner.key
    : source.includes('/') ? source : `${owner.key.split('/')[0]}/${source}`
  const scenario = scenarioByKey.get(key)
  if (scenario === undefined) throw new Error(`${owner.key}: unknown sidecar source ${key}`)
  return scenario
}

interface PersistedLog {
  readonly path: string
  readonly content: string
  readonly header: Record<string, unknown>
}

async function jsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true })
  return latestPersistedSessionPaths(entries).map(entry => join(dir, entry))
}

/** Bound on the external SDK child settling its own turn before the runner closes the runtime. */
const CHILD_SETTLE_TIMEOUT_MS = 60_000

/**
 * Wait until the separate SDK child session persists a settled turn. The child is an
 * independent runtime: closing the parent runtime first disposes it mid-turn and leaves a
 * truncated session as evidence, so the runner reads the child's own log instead of racing it.
 * @param sessionsRoot - the child runtime's isolated home sessions directory.
 * @returns once a child session log carries a turn/end event.
 * @throws when no settled child turn appears within {@link CHILD_SETTLE_TIMEOUT_MS}.
 */
/** Bound on a declared scenario's child settlement before the parent runtime closes. */
const DECLARED_CHILD_SETTLE_TIMEOUT_MS = 65_000

/**
 * Wait for every subagent a declared scenario started to settle, then for its settlement notice.
 * A background SDK child outlives its parent turn; closing first makes the notice text and the
 * child's own turn depend on exit timing. Waiting inside the live runtime makes both deterministic.
 * @param feed - notification subscription over subagent start and finish edges.
 * @param sessionsRoot - the parent runtime's sessions directory.
 * @returns once every started child finished and its settlement notice is persisted, or
 * immediately when the run started none.
 * @throws when the children or their notices do not settle within {@link DECLARED_CHILD_SETTLE_TIMEOUT_MS}.
 */
async function waitForDeclaredChildSettlement(feed: NotificationSubscription, sessionsRoot: string): Promise<void> {
  const deadline = Date.now() + DECLARED_CHILD_SETTLE_TIMEOUT_MS
  let started = 0
  let finished = 0
  while (true) {
    if (Date.now() >= deadline) {
      throw new Error(`declared children did not settle within ${DECLARED_CHILD_SETTLE_TIMEOUT_MS}ms (started=${started}, finished=${finished})`)
    }
    const notification = await Promise.race([
      feed.next(),
      new Promise<undefined>((resolve) => { setTimeout(resolve, Math.min(1_000, deadline - Date.now())) }),
    ])
    if (notification === undefined) {
      // No edge in the idle window: nothing started means nothing to wait for; anything started
      // that has not finished keeps waiting until the deadline.
      if (started === 0) return
      if (finished >= started) break
      continue
    }
    if (notification.method === 'subagent.started') started += 1
    else if (notification.method === 'subagent.finished') finished += 1
    if (started > 0 && finished >= started) break
  }
  // The notice is appended by the parent Agent after the finish edge; waiting for the persisted
  // line keeps the recorded session independent of the close ordering.
  while (Date.now() < deadline) {
    if (existsSync(sessionsRoot)) {
      let notices = 0
      for (const path of await jsonlFiles(sessionsRoot)) {
        const content = await readFile(path, 'utf8')
        notices += content.split('"kind":"subagent-settled"').length - 1
      }
      if (notices >= finished) break
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  // Delivery acknowledgments settle after the request that carried them, so the recorded tail
  // depends on whether that callback lands before close; a quiet log makes the tail deterministic.
  let lastBytes = -1
  let stableSince = Date.now()
  while (Date.now() < deadline) {
    const bytes = await sessionLogBytes(sessionsRoot)
    if (bytes !== lastBytes) {
      lastBytes = bytes
      stableSince = Date.now()
    } else if (Date.now() - stableSince >= 1_000) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`${sessionsRoot}: the session log did not quiesce within ${DECLARED_CHILD_SETTLE_TIMEOUT_MS}ms`)
}

/**
 * Total persisted byte count of a sessions directory's current logs.
 * @param sessionsRoot - sessions directory to measure.
 * @returns summed byte size of every JSONL log under it.
 */
async function sessionLogBytes(sessionsRoot: string): Promise<number> {
  if (!existsSync(sessionsRoot)) return 0
  let bytes = 0
  for (const path of await jsonlFiles(sessionsRoot)) bytes += (await stat(path)).size
  return bytes
}

async function waitForChildSettlement(sessionsRoot: string): Promise<void> {
  const deadline = Date.now() + CHILD_SETTLE_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (existsSync(sessionsRoot)) {
      for (const path of await jsonlFiles(sessionsRoot)) {
        const content = await readFile(path, 'utf8')
        if (content.split('\n').some(line => line.includes('"type":"turn/end"'))) return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`${sessionsRoot}: the separate SDK child persisted no settled turn within ${CHILD_SETTLE_TIMEOUT_MS}ms`)
}

async function persistedLogs(sessionsRoot: string): Promise<PersistedLog[]> {
  const files = await jsonlFiles(sessionsRoot)
  return Promise.all(files.map(async (path) => {
    const content = await readFile(path, 'utf8')
    expect(assertPersistedSessionVersion(basename(path), content), `${path}: current writer`).toBe(SESSION_FORMAT_VERSION)
    const header = JSON.parse(content.slice(0, content.indexOf('\n'))) as Record<string, unknown>
    return { path, content, header }
  }))
}

interface LoggedRequestHeader {
  type?: string
  data?: { header?: { tools?: LoggedTool[] } }
}

interface LoggedSystemMessage {
  type?: string
  data?: { message?: { content?: Array<{ type?: string; text?: unknown }> } }
}

interface LoggedTool {
  readonly name: string
  readonly description?: unknown
  readonly parameters: { readonly required?: string[] }
}

function assembledTools(log: PersistedLog): LoggedTool[] {
  const event = log.content.trimEnd().split('\n')
    .map(line => JSON.parse(line) as LoggedRequestHeader)
    .find(candidate => candidate.type === 'request/header')
  const tools = event?.data?.header?.tools
  if (tools === undefined) throw new Error('session log has no request/header tools')
  return tools
}

function assembledToolRequirements(log: PersistedLog): Record<string, string[]> {
  return Object.fromEntries(assembledTools(log).map(tool => [tool.name, tool.parameters.required ?? []]))
}

function assembledToolDescriptions(log: PersistedLog): Record<string, string> {
  return Object.fromEntries(assembledTools(log).map((tool) => {
    if (typeof tool.description !== 'string') throw new Error(`tool ${tool.name} has no description`)
    return [tool.name, tool.description]
  }))
}

/** The rendered system prompt of the root request: the text of the first `system/message` (surface node 0). */
function assembledSystem(log: PersistedLog): string {
  const event = log.content.trimEnd().split('\n')
    .map(line => JSON.parse(line) as LoggedSystemMessage)
    .find(candidate => candidate.type === 'system/message')
  const system = event?.data?.message?.content?.[0]?.text
  if (typeof system !== 'string') throw new Error('session log has no system/message text')
  return system
}

function assembledRuntimeContexts(log: PersistedLog): string[] {
  return log.content.trimEnd().split('\n').flatMap((line) => {
    const event = JSON.parse(line) as {
      type?: string
      data?: { source?: { kind?: string; sections?: Array<{ text?: unknown }> } }
    }
    if (event.type !== 'user/message' || event.data?.source?.kind !== 'runtime-context') return []
    return event.data.source.sections?.flatMap(section => typeof section.text === 'string' ? [section.text] : []) ?? []
  })
}

function contextOf(logs: readonly { content: string; header: Record<string, unknown> }[], cwd: string): NormalizeContext {
  return {
    sessionIds: logs.flatMap(log => typeof log.header.id === 'string' ? [log.header.id] : []),
    cwd,
  }
}

function contextOfContents(contents: readonly string[]): NormalizeContext {
  const headers = contents.map(content => JSON.parse(content.slice(0, content.indexOf('\n'))) as Record<string, unknown>)
  return {
    sessionIds: headers.flatMap(header => typeof header.id === 'string' ? [header.id] : []),
    cwd: typeof headers[0]?.cwd === 'string' ? headers[0].cwd : '\0no-cwd\0',
  }
}

async function fixtureFiles(scenario: CorpusScenario): Promise<string[]> {
  const names = sessionFixtureNames(await readdir(scenario.dir))
  return Promise.all(names.map(async (name) => {
    const path = join(scenario.dir, name)
    assertSessionFixtureVersion(name, await readFile(path, 'utf8'))
    return path
  }))
}

async function hydrateReplayFixtures(scenario: CorpusScenario, cwd: string): Promise<string[]> {
  const root = join(cwd, '.replay-fixtures')
  await mkdir(root, { recursive: true })
  return Promise.all((await fixtureFiles(scenario)).map(async (source) => {
    const destination = join(root, basename(source))
    await writeFile(destination, (await readFile(source, 'utf8')).replaceAll('{{cwd}}', cwd))
    return destination
  }))
}

/**
 * Normalize the SDK-visible notification stream: embedded `session.event`
 * envelopes get the session-log treatment (times zeroed, headers tokenized),
 * then every record is scrubbed like a wire frame.
 */
function normalizeNotifications(notifications: readonly HarnessNotification[], ctx: NormalizeContext): string {
  const events = notifications
    .filter(n => n.method === 'session.event')
    .map(n => n.params.event as Record<string, unknown>)
  const typedFeedback = events.some(event => event.type === 'feedback/message-put')
  const eventLog = events.map(event => JSON.stringify(event)).join('\n') + '\n'
  const typedLog = typedFeedback
    ? redactSessionSnapshotIds([JSON.stringify({ type: 'session', id: ctx.sessionIds[0] }) + '\n' + eventLog])[0]!.split('\n').slice(1).join('\n')
    : eventLog
  const normalizedEvents = events.length === 0
    ? []
    : scrubModelRequestBulk(normalizeSessionLog(
      normalizeSessionFormatMetadata(typedLog),
      ctx,
      typedFeedback ? { identityMode: 'preserve' } : {},
    )).trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
  let eventIndex = 0
  const records = notifications.map((notification) => {
    if (notification.method !== 'session.event') return { method: notification.method, params: notification.params }
    const event = normalizedEvents[eventIndex++]
    return { method: notification.method, params: { ...notification.params, event } }
  })
  let output = records.map(record => JSON.stringify(record)).join('\n') + '\n'
  if (typedFeedback) {
    for (const [index, id] of ctx.sessionIds.entries()) output = output.replaceAll(id, '{{session:' + (index + 1) + '}}')
  }
  return normalizeStdout(output, ctx, typedFeedback ? { identityMode: 'preserve' } : {})
}

/** Normalize the owned-run projection. */
function normalizeResult(result: RunResult, ctx: NormalizeContext): string {
  return normalizeStdout(`${JSON.stringify({
    sessionId: result.sessionId,
    finalResponse: result.finalResponse,
  })}\n`, ctx)
}

interface JsonObject {
  [key: string]: unknown
}

interface TurnAction {
  readonly kind: 'turn'
  readonly turn: number
  readonly content?: JsonObject[]
}

interface CommandAction {
  readonly kind: 'command'
  readonly line: string
}

type SdkAction = TurnAction | CommandAction

function records(log: string): JsonObject[] {
  return log.split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as JsonObject)
}

/**
 * One persisted session record whose payload reads as a plain object.
 * `goal/change` and `plan/mode` are appended by host plugins outside this
 * harness's compiled module graph, so no `SessionEventMap` entry here types their
 * payloads; the scenario checks below read the payload instead of the event union.
 */
interface SessionRecord extends JsonObject {
  readonly type: string
  readonly data: JsonObject
}

/**
 * Read a persisted log into records with structural payloads.
 * @param log - one persisted session log.
 * @returns every typed record, in log order, each with an object `data`.
 */
function sessionRecords(log: string): SessionRecord[] {
  return records(log).flatMap((record) => {
    if (typeof record.type !== 'string') return []
    const data = record.data
    return [{
      ...record,
      type: record.type,
      data: data !== null && typeof data === 'object' && !Array.isArray(data) ? data as JsonObject : {},
    }]
  })
}

/**
 * The payloads recorded for one host-plugin event type. The goal and plan-mode
 * plugins own those types outside this harness's compiled module graph, so their
 * payloads are read structurally rather than through the typed event union.
 * @param events - session events from a persisted log or an SDK run result.
 * @param type - the host-plugin event type to select.
 * @returns each matching event's payload.
 */
function hostEventPayloads(
  events: readonly { readonly type: string; readonly data?: unknown }[],
  type: string,
): JsonObject[] {
  return events.flatMap((event) => {
    if (event.type !== type) return []
    const data = event.data
    return [data !== null && typeof data === 'object' && !Array.isArray(data) ? data as JsonObject : {}]
  })
}

/** The `source.kind` of a message event payload, when the payload carries a source. */
function sourceKind(data: JsonObject): unknown {
  const source = data.source
  return source !== null && typeof source === 'object' ? (source as JsonObject).kind : undefined
}

function modelFromSession(log: string): { provider: string; model: string } {
  for (const record of records(log)) {
    const data = record.data as JsonObject | undefined
    if (record.type === 'request/header') {
      const header = data?.header as JsonObject | undefined
      const config = header?.config as JsonObject | undefined
      if (typeof config?.provider === 'string' && typeof config.model === 'string') {
        return { provider: config.provider, model: config.model }
      }
      continue
    }
    // A generation recorded before the header carried the route names it here.
    if (record.type === 'request/context'
      && typeof data?.provider === 'string' && typeof data.model === 'string') {
      return { provider: data.provider, model: data.model }
    }
  }
  throw new Error('SDK snapshot session has no request model')
}

/** Replay caller inputs; profile fixtures recreate their own in-turn command activity. */
function sdkActions(log: string, replayStandaloneCommands: boolean): SdkAction[] {
  const actions: SdkAction[] = []
  const commandInputs = new Set<string>()
  let commandId: string | undefined
  let current: TurnAction | undefined
  for (const record of records(log)) {
    if (record.type === 'command/run') {
      if (!replayStandaloneCommands || current !== undefined) continue
      const data = record.data as JsonObject | undefined
      if ((data?.source as JsonObject | undefined)?.kind !== 'user') continue
      if (typeof data?.name !== 'string' || typeof data.args !== 'string' || typeof data.commandId !== 'string') {
        throw new Error('SDK snapshot command/run requires commandId, name and recorded string arguments')
      }
      commandId = data.commandId
      actions.push({ kind: 'command', line: `/${data.name}${data.args}` })
      continue
    }
    const data = record.data as JsonObject | undefined
    // Standalone callers send no other input until command/done. Inputs admitted
    // within that invocation belong to its handler, even when their source is user.
    if (commandId !== undefined && record.type === 'agent/inbox/spliced' && Array.isArray(data?.inserted)) {
      for (const message of data.inserted as JsonObject[]) {
        if (typeof message.id === 'string') commandInputs.add(message.id)
      }
    }
    if (record.type === 'command/done' && data?.commandId === commandId) commandId = undefined
    if (record.type === 'turn/start') {
      const data = record.data as JsonObject | undefined
      if (typeof data?.turn !== 'number') throw new Error('SDK snapshot turn/start has no turn')
      current = { kind: 'turn', turn: data.turn }
      continue
    }
    if (record.type === 'user/message' && current !== undefined && current.content === undefined) {
      const data = record.data as JsonObject | undefined
      const source = data?.source as JsonObject | undefined
      if (source?.kind === 'user' && Array.isArray(data?.content)
        && (typeof data.id !== 'string' || !commandInputs.has(data.id))) {
        current = { kind: 'turn', turn: current.turn, content: data.content as JsonObject[] }
      }
      continue
    }
    if (record.type === 'turn/end' && current !== undefined) {
      actions.push(current)
      current = undefined
    }
  }
  return actions
}

function postActionEventTypes(log: string): string[] {
  const values = records(log)
  const finalActionEnd = values.findLastIndex(record => record.type === 'turn/end' || record.type === 'command/done')
  return values.slice(finalActionEnd + 1).flatMap(record => typeof record.type === 'string' ? [record.type] : [])
}

/**
 * Submit every manifest image with one standalone command, including invocations the
 * handler rejects for carrying attachments.
 * @param scenario - the corpus scenario owning the manifest.
 * @param line - the recorded command line to send as trailing text.
 * @returns the image blocks followed by the command text.
 */
function commandInput(scenario: CorpusScenario, line: string): SdkPromptContentBlock[] {
  return [
    ...scenario.manifest.input?.attachments?.map(image => ({
      type: 'image' as const, data: image.data, mimeType: image.mediaType,
    })) ?? [],
    { type: 'text', text: line },
  ] as SdkPromptContentBlock[]
}

function materializeInput(
  content: readonly JsonObject[],
  scenario: CorpusScenario,
  cwd: string,
  liveSessions: readonly (string | undefined)[],
): SdkPromptContentBlock[] {
  const attachments = new Map(scenario.manifest.input?.attachments?.map(attachment => [attachment.id, attachment]))
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') {
      let output = value.replaceAll('{{cwd}}', cwd)
      output = output.replace(/\{\{session:([1-9]\d*)\}\}/g, (_token, ordinal: string) => {
        const live = liveSessions[Number(ordinal) - 1]
        if (live === undefined) throw new Error(`${scenario.name}: session token ${ordinal} has not bound`)
        return live
      })
      return output
    }
    if (Array.isArray(value)) return value.map(replace)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]))
    }
    return value
  }
  return content.map((block) => {
    if (block.type !== 'image') return replace(block) as SdkPromptContentBlock
    const attachment = block.attachment as JsonObject | undefined
    const id = attachment?.attachmentId
    const input = typeof id === 'string' ? attachments.get(id) : undefined
    if (input === undefined) throw new Error(`${scenario.name}: no input bytes for image attachment ${String(id)}`)
    return { type: 'image', data: input.data, mimeType: input.mediaType } as SdkPromptContentBlock
  })
}

function notificationEvent(notification: HarnessNotification): JsonObject | undefined {
  return notification.method === 'session.event' && notification.params.event !== null
    && typeof notification.params.event === 'object'
    ? notification.params.event as JsonObject
    : undefined
}

async function waitForRootEvent(
  subscription: NotificationSubscription,
  sessionId: string,
  match: (event: JsonObject) => boolean,
  observe: (notification: HarnessNotification) => void,
): Promise<void> {
  while (true) {
    const notification = await subscription.next()
    observe(notification)
    const event = notification.params.sessionId === sessionId ? notificationEvent(notification) : undefined
    if (event !== undefined && match(event)) return
  }
}

/** Command lifecycle notifications precede the RPC result on the same ordered transport. */
function collectCommandNotifications(
  subscription: NotificationSubscription,
  sessionId: string,
  result: RunResult,
  notifications: HarnessNotification[],
  observe: (notification: HarnessNotification) => void,
): void {
  const run = result.events.find(event => event.type === 'command/run')
  if (run === undefined) throw new Error('Command RunResult has no command/run event')
  const commandId = run.data.commandId
  const done = result.events.find(event => event.type === 'command/done' && event.data.commandId === commandId)
  if (done === undefined || done.type !== 'command/done') throw new Error('Command RunResult has no command/done event')
  expect(result.finishReason).not.toBeNull()
  if (done.data.kind === 'error') {
    expect(result.finishReason).toBe('error')
    expect(result.finalResponse).toBe(done.data.text)
  } else {
    const assistant = result.events.findLast(event => event.type === 'assistant/message')
    if (assistant !== undefined) {
      expect(result.finalResponse).toBe(assistant.data.message.content
        .flatMap(block => block.type === 'text' ? [block.text] : []).join(''))
    }
  }
  let started = false
  for (let notification = subscription.tryNext(); notification !== undefined; notification = subscription.tryNext()) {
    observe(notification)
    const event = notification.params.sessionId === sessionId ? notificationEvent(notification) : undefined
    const data = event?.data as JsonObject | undefined
    if (event?.type === 'command/run' && data?.commandId === commandId) started = true
    if (!started) continue
    notifications.push(notification)
    if (event?.type !== 'command/done' || data?.commandId !== commandId) continue
    expect(done.data.kind).toBe(data.kind)
    expect(done.data.text).toBe(data.text)
    expect(done.data.sourceEventSeq).toBe(data.sourceEventSeq)
    return
  }
  throw new Error('SDK command response arrived without its preceding command lifecycle notifications')
}


function authoredPatches(scenario: CorpusScenario, replaying: boolean): string[] {
  const owner = compositionOwner(scenario)
  if (scenario.manifest.composition.startsWith('sdk-')) {
    return [join(owner.dir, 'cordis.yml'), ...(replaying ? [join(owner.dir, 'cordis.snapshot.yml')] : [])]
  }
  const base = compositionOwners.get('default')
  if (base === undefined) throw new Error('SDK corpus has no default transport-neutral composition')
  return [
    join(base.dir, 'cordis.yml'),
    ...owner === base && !replaying ? [] : [join(owner.dir, replaying ? 'cordis.snapshot.yml' : 'cordis.yml')],
    join(base.dir, 'model.cordis.yml'),
  ]
}

/**
 * Create the resolved, fixed-width workspace a manual-compaction recording quotes.
 * mkdtemp appends six characters and JSON quoting is part of the runtime-context text.
 * @param scenario - the scenario whose name forms the directory prefix.
 * @returns the real path of the new workspace, whose JSON quoting is 192 characters.
 */
async function fixedWidthWorkspace(scenario: CorpusScenario): Promise<string> {
  const workspaceParent = await realpath(tmpdir())
  let workspacePrefix = `sdk-snapshot-${scenario.name}-`
  const paddingLength = 192 - JSON.stringify(join(workspaceParent, `${workspacePrefix}XXXXXX`)).length
  if (paddingLength < 0) throw new Error('manual-compact snapshot temporary root exceeds its fixed cwd text length')
  workspacePrefix += '-'.repeat(paddingLength)
  const cwd = await realpath(await mkdtemp(join(workspaceParent, workspacePrefix)))
  expect(JSON.stringify(cwd)).toHaveLength(192)
  return cwd
}

/** One SDK-controlled recorded scenario against a fresh `qilin --profile sdk` subprocess. */
async function runScenario(scenario: CorpusScenario): Promise<{
  results: RunResult[]
  notifications: HarnessNotification[]
  observedMethods: ReadonlySet<string>
  logs: PersistedLog[]
  initialWorkspace: WorkspaceSnapshotEntry[]
  finalWorkspace: WorkspaceSnapshotEntry[]
  cwd: string
  modelRequests: JsonObject[]
}> {
  // The committed corpus records the raw `mkdtemp` path and the runtime's own resolved
  // working directory, so replay emits a working-directory change; only the manual
  // compaction scenario pins a resolved, fixed-width cwd because its prompt quotes it.
  const cwd = scenario.name === 'manual-compact'
    ? await fixedWidthWorkspace(scenario)
    : await mkdtemp(join(tmpdir(), `sdk-snapshot-${scenario.name}-`))
  const qilinHome = join(cwd, '.qilin')
  const sessionsRoot = join(qilinHome, 'sessions')
  const replayFixtures = recording ? [] : await hydrateReplayFixtures(scenario, cwd)
  const fixtureContents = await Promise.all((await fixtureFiles(scenario)).map(file => readFile(file, 'utf8')))
  const primaryFixture = fixtureContents[0]
  if (primaryFixture === undefined) throw new Error(`${scenario.name}: no primary session fixture`)
  const assertionsForScenario = SDK_ASSERTIONS[scenario.name] ?? {}
  const route = assertionsForScenario.route ?? modelFromSession(primaryFixture)
  const patchRoot = join(cwd, '.snapshot-patches')
  await mkdir(patchRoot, { recursive: true })
  const assertions = assertionsForScenario
  const patches = [...authoredPatches(scenario, !recording), ...assertions.patches ?? []]
    .map((patch, index) => materializeProfilePatch(patch, cwd, 'sdk', patchRoot, index))
  let childSessionsRoot: string | undefined
  let childEnvironment: Record<string, string> = {}
  if (assertions.qilinSdkChild !== undefined) {
    const childHome = join(cwd, '.child-qilin')
    const childPatch = materializeProfilePatch(assertions.qilinSdkChild.config, cwd, 'sdk', patchRoot, patches.length)
    await mkdir(childHome, { recursive: true })
    childSessionsRoot = join(childHome, 'sessions')
    childEnvironment = {
      QILIN_TEST_CHILD_PATCHES: JSON.stringify([childPatch]),
      QILIN_TEST_CHILD_HOME: childHome,
    }
  }
  const workspaceDir = join(scenario.dir, 'workspace')
  if (existsSync(workspaceDir)) {
    for (const entry of await readdir(workspaceDir)) {
      await cp(join(workspaceDir, entry), join(cwd, entry), { recursive: true, verbatimSymlinks: true })
    }
  }
  const initialWorkspace = await captureWorkspaceSnapshot(cwd, {
    ignoredRootEntries: RUNTIME_WORKSPACE_ENTRIES,
  })
  const [parentFixture, ...childFixtures] = replayFixtures
  const actions = sdkActions(primaryFixture, assertions.replayStandaloneCommands === true)
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) as Record<string, string>,
    QILIN_SNAPSHOT: mode,
    QILIN_SNAPSHOT_PROVIDER: route.provider,
    QILIN_SNAPSHOT_MODEL: route.model,
    QILIN_TELEMETRY_DISABLED: '1',
    QILIN_AGENTS_HOME: join(cwd, '.agents'),
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
    ...parentFixture === undefined ? {} : {
      QILIN_SNAPSHOT_FILE: parentFixture,
      ...childFixtures.length > 0 ? { QILIN_SNAPSHOT_CHILD_FILES: childFixtures.join(delimiter) } : {},
    },
    ...!recording && scenario.manifest.replay?.override === true
      ? { QILIN_SNAPSHOT_OVERRIDE: join(scenario.dir, 'replay.override.json') }
      : {},
    // The corpus recorded the native tool surface; the profile default could differ.
    QILIN_TOOLS_MODE: scenario.manifest.environment?.QILIN_TOOLS_MODE ?? 'native',
    ...scenario.manifest.environment,
    ...assertions.environment,
    ...childEnvironment,
  }

  const planReviews = assertions.planReviews === undefined ? undefined : [...assertions.planReviews]
  const onUserQuestion = planReviews === undefined ? undefined
    : async (request: SdkUserQuestionRequest): Promise<SdkUserQuestionResult> => {
      expect(request.questions).toHaveLength(1)
      const question = request.questions[0]
      if (question === undefined) throw new Error('plan review has no question')
      expect(question.intent?.kind).toBe('plan-review')
      expect(question.detail).toMatch(/^# /u)
      const choice = planReviews.shift()
      if (choice === undefined) throw new Error('unexpected extra plan review')
      if (choice === 'dismiss') return { cancelled: true }
      return { answers: [{ id: question.id, selected: [choice === 'approve' ? 'Approve' : 'Keep planning'],
        ...choice === 'keep' ? { custom: 'Add rollback.' } : {} }] }
    }
  const harness = new DeepSeekHarness({
    profile: 'sdk',
    patches,
    qilinHome,
    processCwd: cwd,
    env,
    requestTimeoutMs: 110_000,
    cwd,
    provider: route.provider,
    model: route.model,
    ...onUserQuestion === undefined ? {} : { onUserQuestion },
  })
  try {
    const notifications: HarnessNotification[] = []
    const observedMethods = new Set<string>()
    const results: RunResult[] = []
    const sessionId = 'fixture-root-session'
    const liveSessions: (string | undefined)[] = [sessionId]
    await harness.start()
    const settlementFeed = scenario.manifest.settleChildren === true
      ? harness.client.subscribe(notification => notification.method === 'subagent.started' || notification.method === 'subagent.finished')
      : undefined
    const subscription = harness.client.subscribeSessionTree(sessionId)
    const observe = (notification: HarnessNotification): void => {
      observedMethods.add(notification.method)
      if (notification.method !== 'subagent.started') return
      const child = notification.params.childSessionId
      if (typeof child !== 'string' || liveSessions.includes(child)) return
      liveSessions.push(child)
    }
    try {
      const session = harness.session(sessionId)
      for (const action of actions) {
        if (action.kind === 'command') {
          const execution = await session.run(assertions.commandAttachments === true
            ? commandInput(scenario, action.line) : action.line)
          expect(execution.sessionId).toBe(sessionId)
          if (scenario.name === 'plan-review' && action === actions.find(item => item.kind === 'command')) {
            expect(execution).toMatchObject({ finalResponse: 'SDK_PLAN_APPROVED', finishReason: 'completed' })
            expect(execution.events.filter(event => event.type === 'turn/end'))
              .toMatchObject([{ data: { turn: 2, reason: { kind: 'completed' } } }])
          }
          if (scenario.name === 'goal-rounds') {
            expect(execution).toMatchObject({ finalResponse: 'SDK_GOAL_DONE', finishReason: 'completed' })
            expect(hostEventPayloads(execution.events, 'goal/change').map(data => data.operation))
              .toEqual(['create', 'complete'])
            expect(execution.events.filter(event => event.type === 'turn/end')).toMatchObject([
              { data: { turn: 2, reason: { kind: 'completed' } } },
              { data: { turn: 3, reason: { kind: 'completed' } } },
            ])
          }
          collectCommandNotifications(subscription, sessionId, execution, notifications, observe)
          continue
        }
        if (action.content === undefined) {
          await waitForRootEvent(
            subscription,
            sessionId,
            event => event.type === 'turn/end' && (event.data as JsonObject | undefined)?.turn === action.turn,
            (notification) => {
              observe(notification)
              if (assertions.replayStandaloneCommands === true) notifications.push(notification)
            },
          )
          continue
        }
        let result: RunResult | undefined
        if (assertions.replayStandaloneCommands === true) {
          const content = action.content[0]
          if (action.content.length !== 1 || content?.type !== 'text' || typeof content.text !== 'string') {
            throw new Error(`${scenario.name} run fixture requires one text block per prompt`)
          }
          const outcome = await session.run(content.text, {
            onNotification(message) {
              notifications.push(message)
              observe(message)
            },
          })
          result = outcome
        } else {
          const outcome = await session.run(materializeInput(action.content, scenario, cwd, liveSessions), {
            onNotification: (notification) => {
              notifications.push(notification)
              observe(notification)
            },
          })
          result = outcome
        }
        results.push(result)
        if (scenario.manifest.environment?.QILIN_SNAPSHOT_FEEDBACK === '1') {
          const feedback = result.events.filter(event => event.type.startsWith('feedback/'))
          expect(feedback.map(event => event.type)).toEqual([
            'feedback/record', 'feedback/record', 'feedback/message-put', 'feedback/message-put', 'feedback/message-delete',
          ])
        }
        await waitForRootEvent(
          subscription,
          sessionId,
          event => event.type === 'turn/end' && (event.data as JsonObject | undefined)?.turn === action.turn,
          observe,
        )
      }
      for (const type of postActionEventTypes(primaryFixture)) {
        await waitForRootEvent(subscription, sessionId, event => event.type === type, observe)
      }
    } finally {
      subscription.close()
    }
    if (settlementFeed !== undefined) {
      await waitForDeclaredChildSettlement(settlementFeed, sessionsRoot)
      settlementFeed.close()
    }
    if (childSessionsRoot !== undefined) await waitForChildSettlement(childSessionsRoot)
    await harness.close()
    const logs = (await Promise.all([
      persistedLogs(sessionsRoot),
      ...(childSessionsRoot === undefined ? [] : [persistedLogs(childSessionsRoot)]),
    ])).flat()
    const finalWorkspace = await captureWorkspaceSnapshot(cwd, {
      ignoredRootEntries: RUNTIME_WORKSPACE_ENTRIES,
    })
    const modelRequests = assertions.modelRequestsFile !== undefined
      ? records(await readFile(join(qilinHome, assertions.modelRequestsFile), 'utf8'))
      : []
    if (planReviews !== undefined) expect(planReviews).toEqual([])
    return { results, notifications, observedMethods, logs, initialWorkspace, finalWorkspace, cwd, modelRequests }
  } finally {
    await harness.close()
    await rm(cwd, { recursive: true, force: true })
  }
}

/** Order logs parent-first, children by creation time (fixture layout order). */
function orderLogs(logs: PersistedLog[], expectedCount: number, separateQilinSdkChild: boolean): PersistedLog[] {
  if (separateQilinSdkChild) {
    expect(logs).toHaveLength(expectedCount)
    return logs
  }
  const parents = logs.filter(log => typeof log.header.parentSession !== 'string')
  const children = logs.filter(log => typeof log.header.parentSession === 'string')
    .sort((left, right) => Number(left.header.createdAt) - Number(right.header.createdAt))
  expect(parents).toHaveLength(1)
  expect(children).toHaveLength(expectedCount - 1)
  return [...parents, ...children]
}

async function writeHeaderSidecars(
  scenario: CorpusScenario,
  ordered: readonly PersistedLog[],
  ctx: NormalizeContext,
): Promise<void> {
  if (scenario.manifest.header.pin === true) {
    const primary = ordered[0]
    if (primary === undefined) throw new Error(`${scenario.name}: no primary header to snapshot`)
    const prompts = normalizedSystemPrompts(primary.content, ctx)
    const schemas = normalizedToolSchemas(primary.content, ctx)
    if (scenario.manifest.header.systemPromptSource === undefined) {
      await writeFile(
        join(scenario.dir, 'system-prompt.expected.md'),
        formatSystemPromptSnapshot(prompts[0] as string, prompts.slice(1)),
      )
    }
    if (scenario.manifest.header.toolSchemasSource === undefined) {
      await writeFile(
        join(scenario.dir, 'tool-schemas.expected.json'),
        formatToolSchemasSnapshot(schemas[0] as unknown[], schemas.slice(1)),
      )
    }
  }
  for (const index of scenario.manifest.header.childSystemPrompts ?? []) {
    const child = ordered[index]
    if (child === undefined) throw new Error(`${scenario.name}: no child ${index} prompt to snapshot`)
    const prompts = normalizedSystemPrompts(child.content, ctx)
    await writeFile(join(scenario.dir, `system-prompt.${index}.expected.md`), formatSystemPromptSnapshot(
      prompts[0] as string,
      prompts.slice(1),
    ))
  }
  for (const index of scenario.manifest.header.childToolSchemas ?? []) {
    const child = ordered[index]
    if (child === undefined) throw new Error(`${scenario.name}: no child ${index} schemas to snapshot`)
    const schemas = normalizedToolSchemas(child.content, ctx)
    await writeFile(join(scenario.dir, `tool-schemas.${index}.expected.json`), formatToolSchemasSnapshot(
      schemas[0] as unknown[],
      schemas.slice(1),
    ))
  }
}

async function verifyHeaders(
  scenario: CorpusScenario,
  ordered: readonly PersistedLog[],
  ctx: NormalizeContext,
  qilinSdkChildConfig?: Readonly<Record<string, unknown>>,
): Promise<void> {
  const pin = headerPin(scenario)
  const [pinFixturePath] = await fixtureFiles(pin)
  const pinFixture = await readFile(pinFixturePath as string, 'utf8')
  const firstLine = pinFixture.split('\n').find(line => line.trim() !== '') ?? '{}'
  const pinHeader = JSON.parse(firstLine) as JsonObject
  const pinned = normalizedHeaders(pinFixture, {
    sessionIds: [],
    cwd: typeof pinHeader.cwd === 'string' ? pinHeader.cwd : '\0no-cwd\0',
  })
  const promptOwner = sourceScenario(pin, pin.manifest.header.systemPromptSource)
  const schemaOwner = sourceScenario(pin, pin.manifest.header.toolSchemasSource)
  // A profile whose composed guidance differs from its pin's may keep its own copy.
  const ownPrompt = join(scenario.dir, 'system-prompt.expected.md')
  const prompt = await readFile(existsSync(ownPrompt) ? ownPrompt : join(promptOwner.dir, 'system-prompt.expected.md'), 'utf8')
  const schemas = parseToolSchemasSnapshot(await readFile(join(schemaOwner.dir, 'tool-schemas.expected.json'), 'utf8'))
  const schemaSets = [schemas.initial, ...schemas.changes]
  const reconstructed = pinned.map((header, index) => restorePinnedToolSchemas(
    header,
    schemaSets[index] as unknown[],
  ))

  const childPrompts = new Map<number, string>()
  const childSchemas = new Map<number, unknown[][]>()
  for (const index of scenario.manifest.header.childSystemPrompts ?? []) {
    childPrompts.set(index, await readFile(join(scenario.dir, `system-prompt.${index}.expected.md`), 'utf8'))
  }
  for (const index of scenario.manifest.header.childToolSchemas ?? []) {
    const child = parseToolSchemasSnapshot(await readFile(join(scenario.dir, `tool-schemas.${index}.expected.json`), 'utf8'))
    childSchemas.set(index, [child.initial, ...child.changes])
  }

  for (const [logIndex, log] of ordered.entries()) {
    const headers = normalizedHeaders(log.content, ctx)
    const prompts = normalizedSystemPrompts(log.content, ctx)
    if (headers.length > 0) {
      expect(systemPromptPrecedesRequests(log.content), `${scenario.name}: session ${logIndex} has a system/message before its first request/header`).toBe(true)
      expect(prompts.length, `${scenario.name}: session ${logIndex} system/message count`)
        .toBe(1 + (logIndex === 0 ? pin.manifest.header.promptChanges ?? 0 : 0))
    }
    for (const [index, header] of headers.entries()) {
      const selectedSchemas = childSchemas.get(logIndex)?.[index]
      const base = reconstructed[index] ?? reconstructed[0]
      const configured = logIndex === 1 && qilinSdkChildConfig !== undefined
        ? { ...base as JsonObject, config: qilinSdkChildConfig }
        : base
      const expected = selectedSchemas === undefined
        ? configured
        : { ...configured as JsonObject, tools: selectedSchemas }
      expect(header, `${scenario.name}: session ${logIndex} header ${index + 1}`).toEqual(expected)
    }
    if (prompts.length > 0) {
      expect(formatSystemPromptSnapshot(prompts[0] as string, prompts.slice(1)), `${scenario.name}: session ${logIndex} system prompts`)
        .toBe(childPrompts.get(logIndex) ?? prompt)
    }
  }
}

describe('TypeScript SDK snapshots over the jsonrpc runtime', () => {
  for (const scenario of sdkScenarios) {
    const scenarioTest = recording
      && (scenario.manifest.recording === 'authored' || scenario.manifest.sessionFormat !== undefined)
      ? it.skip
      : it
    scenarioTest(`${mode}s ${scenario.name} through qilin --profile sdk`, async () => {
      const scenarioDir = scenario.dir
      const retained = scenario.manifest.sessionFormat !== undefined
      const notificationsExpectedPath = join(scenarioDir, retained ? 'notifications.current.expected.jsonl' : 'notifications.expected.jsonl')
      const resultExpectedPath = join(scenarioDir, 'result.expected.json')
      const hasWireGoldens = existsSync(notificationsExpectedPath) || existsSync(resultExpectedPath)
      const assertions = SDK_ASSERTIONS[scenario.name] ?? {}
      const writesSessionFixtures = writesCurrentSessionFixtures(scenario.manifest, sessionWriteMode)

      let files = await fixtureFiles(scenario)
      const replayContents = await Promise.all(files.map(file => readFile(file, 'utf8')))
      if (!recording && !refreshing) {
        const writerFiles = (await readdir(scenarioDir)).filter(name => /^writer(?:\.[1-9]\d*)?\.expected\.jsonl$/u.test(name)).sort()
        expect(writerFiles, 'native writer oracle inventory').toEqual(retained
          ? files.map((_, index) => writerSnapshotName(index)).sort() : [])
      }
      const { results, notifications, observedMethods, logs, initialWorkspace, finalWorkspace, cwd, modelRequests } = await runScenario(scenario)
      const ordered = orderLogs(
        logs,
        recording ? logs.length : files.length,
        assertions.qilinSdkChild !== undefined,
      )
      const actualContext = contextOf(ordered, cwd)
      if (scenario.name === 'command-attachments') {
        const parent = ordered[0]
        if (parent === undefined) throw new Error('command attachments have no persisted Session')
        const events = sessionRecords(parent.content)
        const commands = events.filter(event => event.type === 'command/run')
        expect(commands.map(event => ({ name: event.data.name, args: event.data.args }))).toEqual([
          { name: 'plan', args: ' Reply SDK_COMMAND_IMAGE_OK without tools.' },
          { name: 'plan', args: ' off' },
          { name: 'compact', args: '' },
          { name: 'permission', args: ' read-only' },
          { name: 'goal', args: '' },
          { name: 'goal', args: ' pause' },
          { name: 'goal', args: ' resume' },
          { name: 'goal', args: ' clear' },
        ])
        const completed = events.filter(event => event.type === 'command/done')
        expect(completed.map(event => event.data.commandId)).toEqual(commands.map(event => event.data.commandId))
        expect(completed.map(event => ({ kind: event.data.kind, text: event.data.text }))).toEqual([
          { kind: 'success', text: 'Plan mode on. Use /plan off to leave.' },
          { kind: 'error', text: 'Attachments cannot accompany /plan off.' },
          { kind: 'error', text: '/compact does not accept attachments' },
          { kind: 'error', text: '/permission does not accept attachments' },
          ...Array.from({ length: 4 }, () => ({ kind: 'error',
            text: 'Attachments only accompany a goal objective: /goal <objective> or /goal edit <objective>.' })),
        ])
        expect(hostEventPayloads(events, 'plan/mode').map(data => data.active)).toEqual([true])
        expect(events.filter(event => event.type === 'permission/preset').map(event => event.data.preset)).toEqual(['workspace-write'])
        expect(hostEventPayloads(events, 'goal/change')).toEqual([])
        expect(events.filter(event => event.type === 'turn/start')).toHaveLength(1)
        expect(events.filter(event => event.type === 'step/start')).toHaveLength(1)
        expect(modelRequests).toHaveLength(1)
        const userMessages = events.filter(event => event.type === 'user/message' && sourceKind(event.data) === 'user')
        expect(userMessages).toHaveLength(1)
        const content = userMessages[0]?.data.content
        expect(content).toEqual([
          { type: 'image', attachment: { attachmentId: scenario.manifest.input?.attachments?.[0]?.id,
            mediaType: 'image/png', bytes: 69, width: 1, height: 1 } },
          { type: 'text', text: 'Reply SDK_COMMAND_IMAGE_OK without tools.' },
        ])
        const requestMessages = modelRequests[0]?.messages as JsonObject[]
        expect(requestMessages.map(message => message.content)).toContainEqual(content)
        expect(JSON.stringify(requestMessages)).toContain('You are in plan mode.')
        expect(events.findLast(event => event.type === 'assistant/message'))
          .toMatchObject({ data: { message: { content: [{ type: 'text', text: 'SDK_COMMAND_IMAGE_OK' }] } } })
      }
      if (scenario.name === 'goal-rounds') {
        const parent = ordered[0]
        if (parent === undefined) throw new Error('goal rounds have no persisted Session')
        const events = sessionRecords(parent.content)
        expect(hostEventPayloads(events, 'goal/change').map(data => data.operation)).toEqual(['create', 'complete'])
        expect(events.filter(event => event.type === 'user/message' && sourceKind(event.data) === 'goal')
          .map(event => event.data.source)).toMatchObject([{ round: 1, revision: 1 }, { round: 2, revision: 1 }])
        expect(events.filter(event => event.type === 'turn/start')).toHaveLength(3)
        expect(events.filter(event => event.type === 'step/start')).toHaveLength(5)
        expect(modelRequests).toHaveLength(5)
        expect(JSON.stringify(modelRequests.at(-1)?.messages)).toContain('<goal_complete>')
        expect(events.findLast(event => event.type === 'assistant/message'))
          .toMatchObject({ data: { message: { content: [{ type: 'text', text: 'SDK_GOAL_DONE' }] } } })
        expect(events.filter(event => event.type === 'sandbox/mode').map(event => event.data.mode)).toEqual(['workspace-write'])
        expect(events.filter(event => event.type === 'approval/policy').map(event => event.data.policy)).toEqual(['ask'])
        expect(notifications.flatMap((notification) => {
          const event = notificationEvent(notification)
          return event?.type === 'goal/change' ? [event] : []
        })).toEqual(events.filter(event => event.type === 'goal/change'))
      }
      if (scenario.name === 'plan-review') {
        const parent = ordered[0]
        if (parent === undefined) throw new Error('plan review has no persisted Session')
        const events = sessionRecords(parent.content)
        expect(hostEventPayloads(events, 'plan/mode').map(data => data.active))
          .toEqual([true, false, true, false])
        expect(events.filter(event => event.type === 'command/run').map(event => ({ name: event.data.name, args: event.data.args })))
          .toEqual([{ name: 'plan', args: ' Prepare a plan through exit_plan_mode; revise after feedback and acknowledge approval.' },
            { name: 'plan', args: '' }, { name: 'plan', args: ' off' }])
        expect(events.filter(event => event.type === 'permission/preset').map(event => event.data.preset)).toEqual(['workspace-write'])
        expect(events.filter(event => event.type === 'sandbox/mode').map(event => event.data.mode)).toEqual(['workspace-write'])
        expect(events.filter(event => event.type === 'approval/policy').map(event => event.data.policy)).toEqual(['ask'])
        expect(events.filter(event => event.type === 'turn/start')).toHaveLength(4)
        expect(events.filter(event => event.type === 'step/start')).toHaveLength(6)
        expect(modelRequests).toHaveLength(6)
        const active = modelRequests.map((request) => {
          const messages = request.messages as JsonObject[]
          const system = messages.filter(message => message.role === 'system').at(-1)
          return JSON.stringify(system).includes('You are in plan mode.')
        })
        expect(active).toEqual([false, true, true, false, true, false])
        expect(modelRequests.map(request => (request.tools as JsonObject[]).some(tool => tool.name === 'exit_plan_mode')))
          .toEqual([false, true, true, true, true, true])
        const toolResults = events.filter(event => event.type === 'tool/result')
        expect(toolResults).toHaveLength(3)
        expect(JSON.stringify(toolResults[0]?.data)).toContain('Add rollback.')
        expect(JSON.stringify(toolResults[1]?.data)).toContain('Plan approved')
        expect(JSON.stringify(toolResults[2]?.data)).toContain('The user dismissed the plan review')
      }
      if (scenario.name === 'command-identity') {
        const parent = ordered[0]
        if (parent === undefined) throw new Error('Command identity has no persisted Session')
        const events = sessionRecords(parent.content)
        expect(events.filter(event => event.type === 'command/run').map(event => event.data.name))
          .toEqual(['access', 'access', 'access'])
        expect(events.filter(event => event.type === 'command/done').map(event => event.data.kind))
          .toEqual(['success', 'success', 'error'])
        expect(events.filter(event => event.type === 'permission/preset').map(event => event.data.preset))
          .toEqual(['danger-full-access', 'read-only'])
        const userMessages = events.filter(event => event.type === 'user/message' && sourceKind(event.data) === 'user')
        expect(userMessages[0]?.data.content).toEqual([{ type: 'text', text: '/permission read-only' }])
        expect(modelRequests).toHaveLength(2)
        const messages = modelRequests[0]?.messages as JsonObject[]
        expect(messages.some(message => message.role === 'user'
          && (message.content as JsonObject[]).some(block => block.type === 'text' && block.text === '/permission read-only')))
          .toBe(true)
      }
      if (scenario.name === 'permission-switch') {
        const parent = ordered[0]
        if (parent === undefined) throw new Error('permission switch has no persisted Session')
        const events = sessionRecords(parent.content)
        const commands = events.filter(event => event.type === 'command/run')
        expect(commands.map(event => ({ name: event.data.name, args: event.data.args }))).toEqual([
          { name: 'permission', args: ' read-only' },
          { name: 'permission', args: ' read-only' },
          { name: 'permission', args: ' missing-preset' },
        ])
        const completed = events.filter(event => event.type === 'command/done')
        expect(completed.map(event => event.data.kind)).toEqual(['success', 'success', 'error'])
        expect(completed.map(event => event.data.commandId)).toEqual(commands.map(event => event.data.commandId))
        expect(events.filter(event => event.type === 'permission/preset').map(event => event.data.preset))
          .toEqual(['danger-full-access', 'read-only'])
        expect(events.filter(event => event.type === 'sandbox/mode').map(event => event.data.mode))
          .toEqual(['danger-full-access', 'read-only'])
        expect(events.filter(event => event.type === 'approval/policy').map(event => event.data.policy))
          .toEqual(['never', 'ask'])
        expect(events.filter(event => event.type === 'turn/start').map(event => event.data.turn)).toEqual([1, 2])
        expect(events.filter(event => event.type === 'step/start')).toHaveLength(2)
        const notices = events.filter(event => event.type === 'user/message' && sourceKind(event.data) === 'user-approval')
        expect(notices).toHaveLength(1)
        expect(modelRequests).toHaveLength(2)
        const [initialRequest, continuationRequest] = modelRequests
        if (initialRequest === undefined || continuationRequest === undefined) {
          throw new Error('permission switch requires its initial and continuation request')
        }
        const initialMessages = initialRequest.messages as JsonObject[]
        const continuationMessages = continuationRequest.messages as JsonObject[]
        expect(continuationMessages[0]).toEqual(initialMessages[0])
        for (const field of ['provider', 'model', 'maxTokens', 'reasoningEffort', 'tools']) {
          expect(continuationRequest[field], `permission switch retained ${field}`).toEqual(initialRequest[field])
        }
        const runtimeContexts = continuationMessages.filter(message => (message.source as JsonObject | undefined)?.kind === 'runtime-context')
        const runtimeText = JSON.stringify(runtimeContexts.at(-1))
        // QiLin composes its own runtime-context wording: the file-policy clause names this product.
        expect(runtimeText).toContain('Current QILIN file policy: read-only.')
        const texts = continuationMessages.flatMap(message => message.content as JsonObject[])
          .flatMap(block => block.type === 'text' ? [block.text] : [])
        expect(texts).toContain('SDK_PERMISSION_READY')
        expect(continuationMessages.map(message => message.content)).toContainEqual(notices[0]?.data.content)
        expect(texts).not.toContain('/permission read-only')
        expect(texts).not.toContain('preset read-only')
      }
      if (scenario.name === 'manual-compact') {
        const parent = ordered[0]
        if (parent === undefined) throw new Error('manual compact has no persisted Session')
        const events = sessionRecords(parent.content)
        const commands = events.filter(event => event.type === 'command/run')
        expect(commands).toHaveLength(1)
        const command = commands[0]
        if (command === undefined) throw new Error('manual compact has no command record')
        expect(command.data.name).toBe('compact')
        const summaries = events.filter(event => event.type === 'compaction/summary')
        expect(summaries).toHaveLength(1)
        const summary = summaries[0]
        if (summary === undefined) throw new Error('manual compact has no summary')
        expect(summary.data).toMatchObject({ sourceCommandId: command.data.commandId, llmStreamCall: true })
        const bracket = events.filter(event => event.type === 'compaction/start' || event.type === 'compaction/end')
        expect(bracket.map(event => event.type)).toEqual(['compaction/start', 'compaction/end'])
        for (const event of bracket) expect(event.data).toMatchObject({ turn: null, sourceCommandId: command.data.commandId })
        const done = events.find(event => event.type === 'command/done')
        expect(done?.data).toMatchObject({ commandId: command.data.commandId, kind: 'success', sourceEventSeq: summary.seq })
        const checkpoint = events.find(event => event.type === 'user/message' && sourceKind(event.data) === 'compact-checkpoint')
        const shadowed = summary.data.shadowedRange as JsonObject
        expect(checkpoint?.surfaceOp).toEqual({ op: 'replace', startSeq: shadowed.start, endSeq: shadowed.end })
        expect(events.filter(event => event.type === 'turn/start').map(event => event.data.turn)).toEqual([1, 2])
        expect(events.filter(event => event.type === 'step/start')).toHaveLength(2)
        const commandNotifications = notifications.flatMap((notification) => {
          const event = notification.params.sessionId === parent.header.id ? notificationEvent(notification) : undefined
          return event?.type === 'command/run' || event?.type === 'command/done' ? [event.type] : []
        })
        expect(commandNotifications).toEqual(['command/run', 'command/done'])

        expect(modelRequests.map(request => request.purpose)).toEqual([undefined, 'compaction', undefined])
        const [initialRequest, summaryRequest, continuationRequest] = modelRequests
        if (initialRequest === undefined || summaryRequest === undefined || continuationRequest === undefined) {
          throw new Error('manual compact requires an initial, auxiliary, and continuation request')
        }
        const initialMessages = initialRequest.messages as JsonObject[]
        const summaryMessages = summaryRequest.messages as JsonObject[]
        const continuationMessages = continuationRequest.messages as JsonObject[]
        expect(summaryRequest.tools).toEqual(initialRequest.tools)
        expect(continuationRequest.tools).toEqual(initialRequest.tools)
        expect(continuationRequest.provider).toBe(initialRequest.provider)
        expect(continuationRequest.model).toBe(initialRequest.model)
        expect(continuationMessages[0]).toEqual(initialMessages[0])
        expect(summaryMessages.slice(0, -1)).toEqual(initialMessages)
        expect(summaryMessages.at(-1)).toMatchObject({ role: 'user', content: [{
          type: 'text', text: expect.stringContaining('You are now acting as a compaction engine'),
        }] })
        const continuationBlocks = continuationMessages.flatMap(message => message.content as JsonObject[])
        expect(continuationBlocks).toEqual(expect.arrayContaining(summary.data.summary as unknown[]))
        const texts = continuationBlocks.flatMap(block => block.type === 'text' ? [block.text] : [])
        expect(texts).not.toContain('/compact')
        expect(texts).not.toContain(done?.data.text)
        expect(texts).toContain('SDK_COMPACT_READY')
      }
      if (scenario.name === 'tool-scheduler-recovery') {
        expect(results).toHaveLength(2)
        const events = results.flatMap(result => result.events)
        expect(results[1]?.finalResponse, JSON.stringify(events.filter(event => event.type === 'turn/end')))
          .toBe('SCHEDULER_RECOVERY_OK')
        expect(events.filter(event => event.type === 'turn/end').map(event => event.data['reason']))
          .toEqual([
            { kind: 'error', error: { message: 'Snapshot scheduler preparation failed', code: 'UNKNOWN' } },
            { kind: 'completed' },
          ])
        expect(events.filter(event => event.type === 'tool/call').map(event => event.data['callId']))
          .toEqual(['scheduler-complete', 'scheduler-fail'])
        const toolResults = events.filter(event => event.type === 'tool/result')
          .map(event => event.data['message'] as { role: string; toolCallId: string; isError: boolean })
        expect(toolResults.map(result => [result.role, result.toolCallId, result.isError])).toEqual([
          ['tool', 'scheduler-complete', false], ['tool', 'scheduler-fail', true], ['tool', 'scheduler-unstarted', true],
        ])
        expect(events.filter(event => event.type === 'todo/write')).toHaveLength(1)
      }
      if (scenario.name === 'subagent-activation-limit') {
        expect(ordered).toHaveLength(2)
        const denied = records(ordered[0]!.content).find(record => record.type === 'tool/result'
          && JSON.stringify(record).includes('call_over_capacity'))
        expect(denied).toMatchObject({ data: {
          message: { content: [{ type: 'text', text: expect.stringContaining('subagent limit reached (active child limit: 1)') }] },
        } })
      }
      if (scenario.name === 'tool-error-details') {
        const events = results.flatMap(result => result.events)
        const errors = events.filter(event => event.type === 'tool/result' || event.type === 'tool/ptc-dispatch')
          .map(event => event.data['error']).filter(error => error !== undefined)
        // PTC-only surface: the outer run_code call delivers the one structured denial.
        expect(errors).toEqual([{
          name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED', reason: '  transport raw\r\nreason  ',
        }])
        const ptc = events.filter(event => event.type.startsWith('tool/ptc-dispatch'))
        expect(ptc.map(event => event.type)).toEqual(['tool/ptc-dispatch-start', 'tool/ptc-dispatch'])
        for (const event of ptc) {
          expect(event.data).not.toHaveProperty('description')
          expect(event.data).not.toHaveProperty('parameters')
          expect(event.data).not.toHaveProperty('schema')
        }
      }
      if (assertions.expectedFinalResponse !== undefined) {
        expect(results.at(-1)?.finalResponse, `${scenario.name}: final response`).toBe(assertions.expectedFinalResponse)
        const parent = ordered[0]
        if (parent === undefined) throw new Error(`${scenario.name}: no primary session log`)
        const turnEnds = records(parent.content).filter(record => record.type === 'turn/end')
        const expectedTurns = records(replayContents[0]!).filter(record => record.type === 'turn/end')
        expect(turnEnds, `${scenario.name}: completed turns`).toHaveLength(expectedTurns.length)
        for (const turnEnd of turnEnds) expect(turnEnd).toMatchObject({ data: { reason: { kind: 'completed' } } })
      }

      let expectedContents = retained && !refreshing
        ? await Promise.all(files.map((_, index) => readFile(join(scenarioDir, writerSnapshotName(index)), 'utf8')))
        : replayContents

      if (recording) {
        expectedContents = redactSessionSnapshotIds(stabilizeFixtureMessageIds(
          ordered.map(log => scrubSessionSnapshot(tokenizeSessionFixtureCwd(log.content))),
          expectedContents,
        ))
      }

      if (refreshing && (writesSessionFixtures || retained)) {
        const harvested = ordered.map((log): HarvestedLog => ({
          id: String(log.header.id),
          createdAt: Number(log.header.createdAt),
          ...typeof log.header.parentSession === 'string' ? { parentSession: log.header.parentSession } : {},
          content: log.content,
        }))
        const replacements = refreshFixtureReplacements(harvested, expectedContents)
        const refreshed = ordered.map((log, index) => {
          const existing = expectedContents[index]
          if (existing === undefined) throw new Error(`no fixture for persisted log ${index}`)
          return scrubSessionSnapshot(tokenizeSessionFixtureCwd(
            stabilizeRefreshLog(log.content, existing, replacements, actualContext),
          ))
        })
        expectedContents = redactSessionSnapshotIds(stabilizeFixtureMessageIds(refreshed, expectedContents))
      }

      if (writesSessionFixtures || refreshing && retained) {
        const outputFiles = ordered.map((log, index) => join(scenarioDir, retained
          ? writerSnapshotName(index)
          : sessionFixtureName(index, sessionHeaderVersion(log.content, `harvested Session ${index}`))))
        await Promise.all(expectedContents.map((stable, index) => writeFile(outputFiles[index] as string, stable)))
        files = outputFiles
        await writeHeaderSidecars(scenario, ordered, actualContext)
      }

      for (const [index, expected] of expectedContents.entries()) {
        expect(scrubModelRequestBulk(expected), `${scenario.name} session fixture ${index} carries prompt text or tool-schema bulk`)
          .toBe(expected)
      }
      expect(redactSessionSnapshotIds(expectedContents), `${scenario.name}: identity redaction fixed point`)
        .toEqual(expectedContents)

      if (retained) {
        expect(await Promise.all((await fixtureFiles(scenario)).map(file => readFile(file, 'utf8'))),
          'historical replay input remains unchanged').toEqual(replayContents)
        for (const [index, content] of expectedContents.entries()) {
          expect(sessionHeaderVersion(content, writerSnapshotName(index))).toBe(SESSION_FORMAT_VERSION)
        }
      }

      // Persisted transcripts match the committed fixtures.
      const expectedContext = contextOfContents(expectedContents)
      const actualSnapshots = normalizeSessionSnapshots(ordered.map(log => log.content), actualContext)
      const expectedSnapshots = normalizeSessionSnapshots(expectedContents, expectedContext)
      expect(actualSnapshots.map(records), `${scenario.name}: sessions`).toEqual(expectedSnapshots.map(records))
      await verifyHeaders(scenario, ordered, actualContext, assertions.qilinSdkChild?.agentConfig)

      // Genuine SDK protocol cases retain their secondary wire projections.
      const finalResult = results.at(-1)
      if (hasWireGoldens) {
        if (finalResult === undefined) throw new Error(`${scenario.name}: SDK wire golden has no run result`)
        const normalizedNotifications = normalizeNotifications(notifications, actualContext)
        const normalizedResult = normalizeResult(finalResult, actualContext)
        if (recording || refreshing) {
          await writeFile(notificationsExpectedPath, normalizedNotifications)
          await writeFile(resultExpectedPath, normalizedResult)
        }
        const expectedNotifications = await readFile(notificationsExpectedPath, 'utf8')
        expect(
          records(normalizedNotifications),
          `${scenario.name}: notifications`,
        )
          .toEqual(records(expectedNotifications))
        expect(normalizedResult).toBe(await readFile(resultExpectedPath, 'utf8'))
      }

      if (scenario.name === 'system-prompt-in-history') {
        const events = notifications.flatMap(notification => {
          const event = notificationEvent(notification)
          return event === undefined ? [] : [event]
        })
        const systems = events.filter(event => event.type === 'system/message')
        expect(systems).toHaveLength(2)
        expect(systems.map(event => event.surfaceOp)).toEqual(['append', 'append'])
        const prompts = systems.map(event => (event.data as {
          message: { content: Array<{ text: string }> }
        }).message.content[0]!.text)
        expect(prompts[0]).not.toContain('Snapshot guidance added after the first read')
        expect(prompts[1]).toContain('Snapshot guidance added after the first read')
        expect(prompts[1]).not.toBe(prompts[0])
        expect(events.indexOf(systems[1]!)).toBeGreaterThan(events.findIndex(event => event.type === 'tool/result'))
        expect(events.filter(event => event.type === 'request/header')).toHaveLength(1)
        expect(events.filter(event => event.type === 'request/context')).toMatchObject([
          { data: { systemPromptUpdate: 'in-history' } },
        ])
        expect(events.filter(event => event.surfaceOp !== undefined).every(event => event.surfaceOp === 'append')).toBe(true)
      }

      // Wire-shape invariants that must hold in every mode.
      if (scenario.manifest.workspace?.final === true) {
        const expectedWorkspace = await captureExpectedWorkspaceSnapshot(join(scenario.dir, 'workspace.expected'))
        expect(finalWorkspace, `${scenario.name}: complete final workspace`).toEqual(expectedWorkspace)
      } else {
        expect(finalWorkspace, `${scenario.name}: a changed workspace requires workspace.final`).toEqual(initialWorkspace)
      }
      if (assertions.expectedTools !== undefined) {
        const parent = ordered[0]
        if (parent === undefined) throw new Error(`${scenario.name} has no parent session log`)
        expect(assembledToolRequirements(parent)).toEqual(assertions.expectedTools)
      }
      if (assertions.expectedSystem !== undefined) {
        const parent = ordered[0]
        if (parent === undefined) throw new Error(`${scenario.name} has no parent session log`)
        expect(assembledSystem(parent)).toBe(assertions.expectedSystem)
      }
      if (assertions.expectedToolDescriptions !== undefined) {
        const parent = ordered[0]
        if (parent === undefined) throw new Error(`${scenario.name} has no parent session log`)
        expect(assembledToolDescriptions(parent)).toMatchObject(assertions.expectedToolDescriptions)
      }
      if (assertions.runtimeContext !== undefined) {
        const parent = ordered[0]
        if (parent === undefined) throw new Error(`${scenario.name} has no parent session log`)
        const contexts = assembledRuntimeContexts(parent)
        if (assertions.runtimeContext === false) {
          expect(contexts).toEqual([])
        } else {
          // One notice per runtime-context section: sandbox and approval policy
          // plus the current working directory.
          expect(contexts.length).toBeGreaterThan(0)
          const context = contexts.join('\n')
          for (const clause of assertions.runtimeContext.includes) expect(context).toContain(clause)
          for (const clause of assertions.runtimeContext.excludes) expect(context).not.toContain(clause)
          const system = assembledSystem(parent)
          for (const clause of assertions.runtimeContext.includes) expect(system).not.toContain(clause)
        }
      }
      if (ordered.length > 1 && assertions.qilinSdkChild === undefined) {
        expect(observedMethods.has('subagent.started')).toBe(true)
        expect(observedMethods.has('subagent.finished')).toBe(true)
      }
    })
  }
})
