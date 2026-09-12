/**
 * CRUD over the `mcp-client` entries of a Cordis Loader patch layer.
 *
 * Every mutation runs through the YAML document API and touches only the nodes
 * that address one server, so comments, quoting, key order, and `!!js`
 * expressions elsewhere in the file survive a write unchanged. A file that
 * does not parse is never written: reading reports the reason, and every
 * mutation refuses with it, because overwriting hand-written configuration is
 * worse than refusing the edit.
 *
 * An entry is addressed by its Loader entry id, `mcp-<serverName>`. Entries
 * live inside a top-level `- insert:` item, which is how a layer adds rows the
 * bundles below it never declared; a bare top-level row would be skipped by
 * `applyEntryPatches` as an unmatched patch. Enablement is the entry's own
 * `disabled` key, which the same patch application reads.
 * @module @qilin/mcp-servers/patch-file
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@qilin/atomic-write'
import { resolveQilinHome } from '@qilin/home-paths'
import { Document, isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import type { McpBuiltinDefinition } from './builtins.ts'
import type { McpServerDraft } from './types.ts'

/**
 * Filename of the home-level user patch layer under the QiLin home. The
 * launcher owns the same filename for a profile's own layer
 * (`PROFILE_PATCH_FILENAME` in `@qilin/app-boot`); this service addresses the
 * home layer, which sits above every profile.
 */
const USER_PATCH_FILENAME = 'cordis.patch.yml'

/**
 * Permission bits stamped on the patch file when this service writes it. A
 * server definition may carry credentials in its `env` map, so the file is
 * owner-only. Replacing the file narrows a wider mode to these bits.
 */
const PATCH_FILE_MODE = 0o600

/** Permission bits for the QiLin home this service creates when it is absent. */
const HOME_DIR_MODE = 0o700

/** Module specifier every managed entry loads. */
const MCP_CLIENT_MODULE = '@qilin/mcp-client'

/** Prefix of a managed Loader entry id. */
const ENTRY_ID_PREFIX = 'mcp-'

/**
 * `serverName` accepted by `mcp-client`. The authority is that package's own
 * `SERVER_NAME_PATTERN`: an entry outside it fails its schema at Loader time, so
 * the same rule is enforced here to reject the value in the operation that
 * accepts it.
 */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Config keys this service owns; a config's other keys keep their own nodes. */
const MANAGED_CONFIG_KEYS = [
  'transport',
  'serverName',
  'command',
  'args',
  'cwd',
  'url',
  'headers',
  'toolCallTimeoutMs',
  'failOnStartupError',
] as const

/**
 * Loader entry id of the `mcp-client` instance serving one `serverName`.
 * @param serverName - the namespace the entry reserves.
 * @returns the entry id.
 */
export function entryIdOf(serverName: string): string {
  return ENTRY_ID_PREFIX + serverName
}

/**
 * Absolute path of the home-level user patch layer this service reads and writes.
 * @returns the patch-file path under the resolved QiLin home.
 */
export function userPatchPath(): string {
  return join(resolveQilinHome(), USER_PATCH_FILENAME)
}

/** One `mcp-client` entry found in a patch layer. */
export interface UserPatchEntry {
  /** Namespace the entry reserves, from its config when present, else its id suffix. */
  readonly serverName: string
  readonly entryId: string
  /** The entry's `config` as plain data; a non-map config reads as empty. */
  readonly config: Readonly<Record<string, unknown>>
  /** Whether the entry is enabled; only an explicit `disabled: true` disables it. */
  readonly enabled: boolean
}

/** One read of a patch layer: its entries, or why the file is not addressable. */
export interface UserPatchRead {
  /** Entries the layer declares, in file order; empty when the file is not addressable. */
  readonly entries: readonly UserPatchEntry[]
  /** The reason this layer admits no read or write; absent when it parsed. */
  readonly error?: string
}

/** The patch layer is not an entry list this service may write. */
export class UserPatchFileError extends Error {
  /**
   * @param message - what the file is instead of an addressable patch list.
   */
  constructor(message: string) {
    super(message)
    this.name = 'UserPatchFileError'
  }
}

/** A `serverName` outside the pattern `mcp-client` accepts. */
export class McpServerNameError extends Error {
  /**
   * @param serverName - the rejected namespace.
   */
  constructor(readonly serverName: string) {
    super('"' + serverName + '" must match [A-Za-z0-9_-]{1,32}')
    this.name = 'McpServerNameError'
  }
}

/**
 * Raise the configured-server refusal for a `serverName` the Loader would reject.
 * @param serverName - the candidate namespace.
 * @throws {McpServerNameError} when the name is outside `mcp-client`'s own pattern.
 */
export function assertServerName(serverName: string): void {
  if (!SERVER_NAME_PATTERN.test(serverName)) throw new McpServerNameError(serverName)
}

/** Where one managed entry sits inside the loaded document. */
interface EntryLocation {
  readonly node: YAMLMap
  readonly list: YAMLSeq
}

/** One loaded layer: the document to write back and the root list to address. */
interface LoadedLayer {
  readonly document: Document
  readonly root: YAMLSeq
}

/** The outcome of loading a layer: either the layer or the reason there is none. */
type LoadResult =
  | { readonly ok: true; readonly layer: LoadedLayer }
  | { readonly ok: false; readonly reason: string }

/** A layer for a file that does not exist yet; the first mutation creates it. */
function emptyLayer(path: string): LoadedLayer {
  const document = new Document([])
  const root = document.contents as unknown as YAMLSeq
  /* v8 ignore next -- a document built from an array holds that array as its root list */
  if (!isSeq(root)) throw new UserPatchFileError(path + ' is not a Loader patch list')
  return { document, root }
}

/**
 * The managed config a draft describes: only the keys the draft states, so a
 * written entry never carries an explicit `undefined` or a key belonging to
 * the other transport.
 */
function managedFields(draft: McpServerDraft): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    transport: draft.transport,
    serverName: draft.serverName,
  }
  if (draft.toolCallTimeoutMs !== undefined) fields.toolCallTimeoutMs = draft.toolCallTimeoutMs
  if (draft.failOnStartupError !== undefined) fields.failOnStartupError = draft.failOnStartupError
  if (draft.transport === 'stdio') {
    fields.command = draft.command ?? ''
    if (draft.args !== undefined && draft.args.length > 0) fields.args = [...draft.args]
    if (draft.cwd !== undefined && draft.cwd.length > 0) fields.cwd = draft.cwd
  } else {
    fields.url = draft.url ?? ''
  }
  return fields
}

/**
 * The entry's `config` as plain data, for callers that only display it. A YAML
 * mapping converts to a plain object, so the map check above is the validation.
 * @param document - the document the node belongs to, which YAML conversion requires.
 * @param node - the entry's `config` node, of any YAML kind.
 * @returns the config as a plain object; empty when the node is not a map.
 */
function configData(document: Document, node: unknown): Readonly<Record<string, unknown>> {
  if (!isMap(node)) return {}
  return node.toJS(document) as Readonly<Record<string, unknown>>
}

/**
 * Name the display fields of one entry: the transport, and the command line or
 * endpoint URL that identifies the server to a reader.
 * @param entry - a configured entry.
 * @returns the transport and its display detail.
 */
export function describeEntry(entry: UserPatchEntry): { transport: 'stdio' | 'streamable-http'; detail: string } {
  if (entry.config.transport === 'streamable-http') {
    const url = typeof entry.config.url === 'string' ? entry.config.url : ''
    return { transport: 'streamable-http', detail: url }
  }
  const command = typeof entry.config.command === 'string' ? entry.config.command : entry.serverName
  const args = Array.isArray(entry.config.args)
    ? entry.config.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  return { transport: 'stdio', detail: [command, ...args].join(' ') }
}

/** Read-modify-write access to one patch layer's `mcp-client` entries. */
export class UserPatchFile {
  /** Queue tail; every mutation waits for the one before it. */
  private pending: Promise<void> = Promise.resolve()

  /**
   * @param path - the patch layer to read and write.
   */
  constructor(readonly path: string = userPatchPath()) {}

  /**
   * Every `mcp-client` entry this layer declares, in file order.
   * @returns the entries, or the reason the file is not addressable.
   */
  async read(): Promise<UserPatchRead> {
    const loaded = await this.load()
    return loaded.ok
      ? { entries: [...this.locateAll(loaded.layer)].map(found => found.entry) }
      : { entries: [], error: loaded.reason }
  }

  /**
   * Write one server's settings, adding its entry when the layer has none.
   * Managed keys are replaced in place, and keys this service does not own
   * (`env`, `reconnect`) keep their own nodes.
   * @param draft - the complete settings for one server.
   * @throws {McpServerNameError} when the draft's name is outside the accepted pattern.
   * @throws {UserPatchFileError} when the file is not an addressable patch list.
   */
  async upsert(draft: McpServerDraft): Promise<void> {
    assertServerName(draft.serverName)
    return this.serialize(async () => {
      const layer = await this.requiredLayer()
      const target = this.locate(layer, draft.serverName) ?? this.insert(layer, draft)
      this.applyDraft(target.node, draft)
      await this.write(layer.document)
    })
  }

  /**
   * Remove one server's entry, dropping the `insert` item that held it when
   * nothing else remains in that item.
   * @param serverName - the namespace to remove.
   * @returns whether the layer declared the server.
   * @throws {UserPatchFileError} when the file is not an addressable patch list.
   */
  async remove(serverName: string): Promise<boolean> {
    return this.serialize(async () => {
      const layer = await this.requiredLayer()
      const located = this.locate(layer, serverName)
      if (located === undefined) return false
      located.list.items = located.list.items.filter(item => item !== located.node)
      this.prune(layer.root, located.list)
      await this.write(layer.document)
      return true
    })
  }

  /**
   * Set one server's enablement through the entry's own `disabled` key.
   * @param serverName - the namespace to change.
   * @param enabled - the next enablement.
   * @throws {UserPatchFileError} when the file is not an addressable patch list,
   * or declares no such server.
   */
  async setEnabled(serverName: string, enabled: boolean): Promise<void> {
    return this.serialize(async () => {
      const layer = await this.requiredLayer()
      const located = this.locate(layer, serverName)
      if (located === undefined) {
        throw new UserPatchFileError(this.path + ' declares no MCP server named "' + serverName + '"')
      }
      if (enabled) located.node.delete('disabled')
      else located.node.set('disabled', true)
      await this.write(layer.document)
    })
  }

  /**
   * Add one recommended server if the layer does not declare it yet. An existing
   * entry is left exactly as the user configured it.
   * @param definition - the recommended server to add.
   * @returns whether this call added an entry.
   * @throws {UserPatchFileError} when the file is not an addressable patch list.
   */
  async addBuiltin(definition: McpBuiltinDefinition): Promise<boolean> {
    return this.serialize(async () => {
      const layer = await this.requiredLayer()
      if (this.locate(layer, definition.name) !== undefined) return false
      const draft: McpServerDraft = {
        serverName: definition.name,
        transport: 'stdio',
        command: definition.command,
        args: [...definition.args],
      }
      this.applyDraft(this.insert(layer, draft).node, draft)
      await this.write(layer.document)
      return true
    })
  }

  /** Serialize a mutation behind every mutation already queued, and keep the queue usable after one fails. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    // The tail records completion only: the caller still receives `result`, and a
    // rejected tail would otherwise block every later mutation.
    this.pending = result.then(() => undefined, () => undefined)
    return result
  }

  /** Load a layer for a mutation, refusing a file no write may overwrite. */
  private async requiredLayer(): Promise<LoadedLayer> {
    const loaded = await this.load()
    if (!loaded.ok) throw new UserPatchFileError(loaded.reason)
    return loaded.layer
  }

  /**
   * Read and parse the layer. An absent file is an empty layer awaiting its
   * first write; every other failure is reported as a reason rather than
   * thrown, because reading is also how a caller discovers the refusal.
   */
  private async load(): Promise<LoadResult> {
    let content: string
    try {
      content = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { ok: true, layer: emptyLayer(this.path) }
      return { ok: false, reason: 'failed to read ' + this.path + ': ' + String(error) }
    }
    const document = parseDocument(content)
    if (document.errors.length > 0) {
      const reasons = document.errors.map(error => error.message).join('; ')
      return { ok: false, reason: this.path + ' is not valid YAML: ' + reasons }
    }
    if (document.contents === null) {
      // A file holding only comments keeps them: the list is added to the
      // document that produced them rather than in a fresh one. YAML types a
      // freshly created node separately from a parsed tree, which is the only
      // reason this assignment needs an assertion.
      document.contents = document.createNode([]) as unknown as typeof document.contents
    }
    if (!isSeq(document.contents)) return { ok: false, reason: this.path + ' is not a Loader patch list' }
    return { ok: true, layer: { document, root: document.contents } }
  }

  /** Append one entry inside a new `insert` item and return where it landed. */
  private insert(layer: LoadedLayer, draft: McpServerDraft): EntryLocation {
    const entry = layer.document.createNode({
      id: entryIdOf(draft.serverName),
      name: MCP_CLIENT_MODULE,
      config: {},
    }) as YAMLMap
    const list = layer.document.createNode([entry]) as YAMLSeq
    layer.root.add(layer.document.createNode({ insert: list }))
    return { node: entry, list }
  }

  /** Replace every managed key of one entry's config, leaving the keys this service does not own. */
  private applyDraft(node: YAMLMap, draft: McpServerDraft): void {
    const config = node.get('config')
    if (!isMap(config)) {
      node.set('config', managedFields(draft))
      return
    }
    for (const key of MANAGED_CONFIG_KEYS) config.delete(key)
    for (const [key, value] of Object.entries(managedFields(draft))) config.set(key, value)
  }

  /** Drop the top-level item that held one `insert` list once that list is empty. */
  private prune(root: YAMLSeq, list: YAMLSeq): void {
    if (list.items.length > 0) return
    root.items = root.items.filter(
      item => !(isMap(item) && item.items.length === 1 && item.get('insert') === list),
    )
  }

  /** Every managed entry of the layer, with the list holding it. */
  private *locateAll(layer: LoadedLayer): Generator<EntryLocation & { entry: UserPatchEntry }> {
    for (const item of layer.root.items) {
      if (!isMap(item)) continue
      const insert = item.get('insert')
      if (!isSeq(insert)) continue
      for (const candidate of insert.items) {
        if (!isMap(candidate)) continue
        if (candidate.get('name') !== MCP_CLIENT_MODULE) continue
        const id = candidate.get('id')
        if (typeof id !== 'string' || !id.startsWith(ENTRY_ID_PREFIX)) continue
        const config = configData(layer.document, candidate.get('config'))
        const declared = config.serverName
        yield {
          node: candidate,
          list: insert,
          entry: {
            serverName: typeof declared === 'string' ? declared : id.slice(ENTRY_ID_PREFIX.length),
            entryId: id,
            config,
            enabled: candidate.get('disabled') !== true,
          },
        }
      }
    }
  }

  /** The one managed entry for a `serverName`, when the layer declares it. */
  private locate(layer: LoadedLayer, serverName: string): EntryLocation | undefined {
    for (const found of this.locateAll(layer)) {
      if (found.entry.serverName === serverName) return { node: found.node, list: found.list }
    }
    return undefined
  }

  /** Replace the layer with the document's current text in one atomic step. */
  private async write(document: Document): Promise<void> {
    const text = String(document)
    /* v8 ignore next -- YAML serialization always terminates a document with a newline */
    const terminated = text.endsWith('\n') ? text : text + '\n'
    await writeFileAtomic(this.path, terminated, { mode: PATCH_FILE_MODE, dirMode: HOME_DIR_MODE })
  }
}
