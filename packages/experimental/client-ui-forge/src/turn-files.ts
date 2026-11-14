/**
 * Which files the last ended turn touched, folded from its tool calls.
 *
 * The changes view's last-turn scope reads this projection instead of scanning
 * the session log. A call counts only when its result reports success; the
 * paths come from the call's arguments. Patch tools contribute every file their
 * patch names, and shell commands are read best-effort — redirections and a
 * small set of writing commands — because arbitrary programs are not traced.
 */

import { isAbsolute, relative, sep } from 'node:path'
import { z } from 'zod'
import type { SessionEvent } from '@qilin-agent/session'
import type { ProjectionDefinition } from '@qilin-agent/session-projection'

/** Paths one turn touched, as the changes view reads them. */
export interface ForgeTurnFilesState {
  /** The last turn that ended, or null before any turn ended. */
  readonly turn: number | null
  /** Absolute paths that turn changed, deduplicated in first-seen order. */
  readonly paths: readonly string[]
  /** Working directory the turn ran in, used to resolve relative arguments. */
  readonly cwd: string | null
  /** Paths of calls whose results have not arrived yet, keyed by call id. */
  readonly pending: Readonly<Record<string, readonly string[]>>
}

const stateSchema: z.ZodType<ForgeTurnFilesState> = z.object({
  turn: z.number().int().nonnegative().nullable(),
  paths: z.array(z.string().min(1)),
  cwd: z.string().min(1).nullable(),
  pending: z.record(z.string(), z.array(z.string().min(1))),
}).strict()

const EMPTY: ForgeTurnFilesState = { turn: null, paths: [], cwd: null, pending: {} }

declare module '@qilin-agent/session-projection/types' {
  interface SessionProjectionStateMap {
    /** Per-Session files the last ended turn touched, folded from its tool calls. */
    forgeTurnFiles: ForgeTurnFilesState
  }
}

/** Tool names whose `path` argument names the file they write. */
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'write', 'write_file', 'create_file', 'edit', 'edit_file', 'delete', 'remove', 'delete_file', 'remove_file',
])

/** Tool names whose source and destination both count. */
const MOVE_TOOLS: ReadonlySet<string> = new Set(['move', 'rename', 'move_file', 'rename_file'])

/** Tool names whose arguments carry a patch. */
const PATCH_TOOLS: ReadonlySet<string> = new Set(['apply_patch', 'patch', 'git_apply'])

/** Tool names whose command text is read for writing targets. */
const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'shell', 'terminal', 'run', 'exec'])

/** Commands whose non-flag arguments name files they write. */
const WRITING_COMMANDS: ReadonlySet<string> = new Set(['rm', 'mv', 'cp', 'touch', 'truncate', 'sed'])

/**
 * Whether `path` is `root` or lies below it.
 * @param root - absolute directory.
 * @param path - absolute path.
 * @returns whether `root` contains `path`.
 */
export function within(root: string, path: string): boolean {
  const rest = relative(root, path)
  return rest === '' || (rest !== '..' && !rest.startsWith(`..${sep}`) && !isAbsolute(rest))
}

/** Resolve one argument path against the turn's directory, dropping paths outside it. */
function resolvePath(cwd: string | null, path: string): string | undefined {
  const trimmed = path.trim()
  if (trimmed === '' || /[$*?`()]/u.test(trimmed)) return undefined
  if (cwd === null) return isAbsolute(trimmed) ? trimmed : undefined
  const absolute = isAbsolute(trimmed) ? trimmed : `${cwd}/${trimmed}`
  return within(cwd, absolute) ? absolute : undefined
}

/** Read one string field of a parsed argument object. */
function field(parsed: Record<string, unknown>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = parsed[name]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * Every file a patch names: apply-patch headers and unified-diff headers. A
 * rename names both sides, so the removed path and the added one both count.
 * @param text - patch text.
 * @returns file paths in the patch's own order.
 */
export function patchPaths(text: string): string[] {
  const paths: string[] = []
  const push = (path: string | undefined): void => {
    if (path === undefined) return
    const trimmed = path.trim()
    if (trimmed !== '' && !paths.includes(trimmed)) paths.push(trimmed)
  }
  for (const match of text.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gmu)) push(match[1])
  for (const match of text.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gmu)) {
    push(match[1])
    push(match[2])
  }
  for (const match of text.matchAll(/^\+\+\+ b\/(.+?)(?:\t.*)?$/gmu)) push(match[1])
  for (const match of text.matchAll(/^--- a\/(.+?)(?:\t.*)?$/gmu)) push(match[1])
  return paths
}

/** Split one shell command into words, keeping simple quoted runs together. */
function words(command: string): string[] {
  return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu)?.map(word => word.replace(/^["']|["']$/gu, '')) ?? []
}

/**
 * Files a shell command writes, best-effort: redirection targets, `tee`
 * arguments, and the arguments of a small set of writing commands. Tokens that
 * need expansion are dropped rather than guessed.
 * @param command - the command text.
 * @returns path tokens as written, before resolution.
 */
export function shellPaths(command: string): string[] {
  const list = words(command)
  const found: string[] = []
  const push = (token: string | undefined): void => {
    if (token === undefined) return
    const trimmed = token.trim()
    if (trimmed === '' || trimmed.startsWith('-') || /[$*?`()]/u.test(trimmed)) return
    found.push(trimmed)
  }
  for (const [index, token] of list.entries()) {
    // A redirection target is written whatever program precedes it.
    if (/^\d*>>?$/u.test(token)) push(list[index + 1])
    else {
      const attached = /^\d*>>?(.+)$/u.exec(token)
      if (attached !== null) push(attached[1])
    }
  }
  // Read the writing commands' own arguments; the program name repeats after a
  // pipeline separator, so each segment is read from its first word.
  const segments: string[][] = [[]]
  for (const token of list) {
    if (token === '|' || token === '||' || token === '&&' || token === ';') segments.push([])
    else segments.at(-1)?.push(token)
  }
  for (const segment of segments) {
    const program = segment[0]
    if (program === undefined) continue
    const args = segment.slice(1)
    if (program === 'tee') {
      for (const token of args) push(token)
      continue
    }
    if (program === 'dd') {
      for (const token of args) {
        const of = /^of=(.+)$/u.exec(token)
        if (of !== null) push(of[1])
      }
      continue
    }
    if (program === 'git') {
      const subcommand = args[0]
      if (subcommand === 'apply') {
        for (const token of args.slice(1)) push(token)
      } else if (subcommand === 'checkout' || subcommand === 'restore') {
        const rest = args.slice(1)
        // `git checkout -- <path>` and `git restore <path>` name the files after the separator.
        for (const token of rest) if (token !== '--') push(token)
      }
      continue
    }
    if (!WRITING_COMMANDS.has(program)) continue
    if (program === 'sed') {
      // `sed` writes in place only with -i, and its first positional argument is
      // the script; the files follow it.
      if (!args.some(token => token === '-i' || token.startsWith('-i') || token.startsWith('--in-place'))) continue
      const positional = args.filter(token => !token.startsWith('-') && token !== '-e')
      for (const token of positional.slice(1)) push(token)
      continue
    }
    for (const token of args) push(token)
  }
  return found
}

/**
 * Paths one tool call names, before resolution: write/edit arguments, patch
 * headers, and shell writing targets.
 * @param name - tool name.
 * @param argumentsText - the call's raw JSON arguments.
 * @returns path tokens the call names.
 */
export function callPaths(name: string, argumentsText: string): string[] {
  let parsed: Record<string, unknown>
  try {
    const value: unknown = JSON.parse(argumentsText)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
    parsed = value as Record<string, unknown>
  } catch {
    // A shell or patch call may carry raw text rather than JSON.
    parsed = {}
  }
  const raw = argumentsText
  if (WRITE_TOOLS.has(name)) {
    const path = field(parsed, ['path', 'file_path', 'filePath', 'file'])
    return path === undefined ? [] : [path]
  }
  if (MOVE_TOOLS.has(name)) {
    const from = field(parsed, ['from', 'source', 'oldPath', 'old_path'])
    const to = field(parsed, ['to', 'destination', 'newPath', 'new_path'])
    return [from, to].filter((value): value is string => value !== undefined)
  }
  if (PATCH_TOOLS.has(name)) {
    const text = field(parsed, ['patch', 'input', 'content', 'diff'])
    return patchPaths(text ?? raw)
  }
  if (SHELL_TOOLS.has(name)) {
    const command = field(parsed, ['command', 'cmd', 'script'])
    return command === undefined ? [] : shellPaths(command)
  }
  return []
}

function apply(state: ForgeTurnFilesState, event: SessionEvent): ForgeTurnFilesState {
  switch (event.type) {
    case 'turn/start':
      // Each turn starts its own set; the previous turn's is already committed.
      return state.paths.length === 0 && Object.keys(state.pending).length === 0 ? state : { ...state, paths: [], pending: {} }
    case 'working-directory/change':
      return state.cwd === event.data.cwd ? state : { ...state, cwd: event.data.cwd }
    case 'tool/call': {
      const paths = callPaths(event.data.name, event.data.arguments)
        .map(path => resolvePath(state.cwd, path))
        .filter((path): path is string => path !== undefined)
      if (paths.length === 0) return state
      return { ...state, pending: { ...state.pending, [event.data.callId]: paths } }
    }
    case 'tool/result': {
      const callId = event.data.message.toolCallId
      const named = state.pending[callId]
      if (named === undefined) return state
      const { [callId]: _settled, ...pending } = state.pending
      if (event.data.message.isError === true || event.data.error !== undefined) return { ...state, pending }
      const added = named.filter(path => !state.paths.includes(path))
      return added.length === 0 ? { ...state, pending } : { ...state, pending, paths: [...state.paths, ...added] }
    }
    case 'turn/end':
      return { ...state, turn: event.data.turn, pending: {} }
    default:
      return state
  }
}

/** The projection over one session's tool calls: its last ended turn and the files it touched. */
export const forgeTurnFilesProjection: ProjectionDefinition<'forgeTurnFiles', ForgeTurnFilesState> = {
  key: 'forgeTurnFiles',
  stateVersion: 1,
  stateSchema,
  init: header => ({ ...EMPTY, cwd: header.cwd ?? null }),
  apply,
}
