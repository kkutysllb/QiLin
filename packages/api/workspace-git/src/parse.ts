/**
 * Pure parsers for the fixed git and gh output formats this service consumes.
 * Each takes a recorded output string and returns wire values with no
 * filesystem or process access, so fixtures in `tests/parse.spec.ts` and
 * `tests/gh-parse.spec.ts` pin the grammar.
 * @module @qilin/api-workspace-git
 */

import type { GhPr, GitBranch, GitLogEntry, GitStatusEntry, GitUpstream } from './types.ts'

/**
 * Parse `git status --porcelain=v1 -z --untracked-files=all` output into
 * entries. Records are NUL-terminated `XY <path>` strings; a rename or copy
 * (`X` of `R` or `C`) is followed by a second NUL-terminated record holding
 * the origin path, which this parser skips in favor of the current path.
 * @param output - the complete `-z` output of one `git status` invocation.
 * @returns entries in output order; unparseable trailing bytes produce no entry.
 */
export function parseStatusPorcelain(output: string): readonly GitStatusEntry[] {
  const records = output.split('\0')
  const entries: GitStatusEntry[] = []
  for (let at = 0; at < records.length; at += 1) {
    const record = records[at]
    if (record === undefined || record.length < 4) continue
    const index = record.charAt(0)
    const worktree = record.charAt(1)
    if (record.charAt(2) !== ' ') continue
    const path = record.slice(3)
    /* v8 ignore next -- the four-character floor above keeps every record at least four characters, so the sliced path is never empty. */
    if (path.length === 0) continue
    if (index === 'R' || index === 'C') at += 1
    entries.push({
      path,
      index,
      worktree,
      staged: index !== ' ' && index !== '?',
      unstaged: worktree !== ' ' && worktree !== '?',
      untracked: index === '?' && worktree === '?',
    })
  }
  return entries
}

/**
 * Parse the one-line `rev-list --left-right --count HEAD...<upstream>`
 * answer into the ahead/behind pair.
 * @param output - the complete stdout of one `rev-list --left-right --count` invocation.
 * @returns the counts, or `undefined` when the line is not two integers.
 */
export function parseAheadBehind(output: string): GitUpstream | undefined {
  const match = /^(\d+)\s+(\d+)\s*$/u.exec(output)
  if (match === null) return undefined
  return { ahead: Number(match[1]), behind: Number(match[2]) }
}

/**
 * Parse `for-each-ref` output in the fixed format this service requests —
 * tab-joined `%(refname:short)`, `%(HEAD)`, `%(upstream:short)`,
 * `%(upstream:track,nobracket)` — into branches. A line without a tab is not
 * a branch record and is dropped. Tracking text without integer counts
 * (`gone`, empty) reports `0/0` counts; the upstream name still rides along.
 * @param output - the complete stdout of the one `for-each-ref` invocation.
 * @returns branches in output order.
 */
export function parseBranches(output: string): readonly GitBranch[] {
  const branches: GitBranch[] = []
  for (const line of output.split('\n')) {
    if (!line.includes('\t')) continue
    const [name, head, upstream, track] = line.split('\t')
    if (name === undefined || name.length === 0 || head === undefined) continue
    branches.push({
      name,
      current: head.trim() === '*',
      ...(upstream === undefined || upstream.length === 0 ? {} : { upstream }),
      ...countsOf(track ?? ''),
    })
  }
  return branches
}

/** Read the ahead/behind integers out of one `%(upstream:track,nobracket)` value. */
function countsOf(track: string): { ahead: number; behind: number } {
  const ahead = /\bahead (\d+)\b/u.exec(track)
  const behind = /\bbehind (\d+)\b/u.exec(track)
  return { ahead: ahead === null ? 0 : Number(ahead[1]), behind: behind === null ? 0 : Number(behind[1]) }
}

/**
 * Parse the fixed `--pretty=format` history records this service requests —
 * `%H`, `%h`, `%an`, `%aI`, `%D`, `%s` joined by unit separators and each
 * terminated by a record separator — into commits. The subject is read from
 * everything after the fifth separator, so a separator inside a subject
 * shifts no field. git writes one newline between records, after the
 * terminator before it. A record with fewer than six fields is not a history
 * record and is dropped.
 * @param output - the complete stdout of the one `git log` invocation.
 * @returns commits in output order, newest first.
 */
export function parseGitLog(output: string): readonly GitLogEntry[] {
  const entries: GitLogEntry[] = []
  for (const record of output.split('\x1e')) {
    const text = record.replace(/^\n+/u, '')
    if (text.length === 0) continue
    const fields = text.split('\x1f')
    if (fields.length < 6) continue
    const [hash = '', short = '', author = '', date = '', decorations = ''] = fields
    entries.push({
      hash,
      short,
      author,
      date,
      subject: fields.slice(5).join('\x1f'),
      refs: decorationsOf(decorations),
    })
  }
  return entries
}

/**
 * The ref names of one `%D` decoration value, deduplicated. Each name drops
 * its decoration kind (`HEAD -> `, `tag: `); a bare `HEAD` — a detached
 * `HEAD` pointing nowhere else — names no ref.
 * @param decorations - the `%D` value of one commit, as git printed it.
 * @returns the names, in the order git listed them.
 */
function decorationsOf(decorations: string): readonly string[] {
  const refs: string[] = []
  for (const decorated of decorations.split(', ')) {
    const name = decorated.trim().replace(/^HEAD -> /u, '').replace(/^tag: /u, '')
    if (name.length === 0 || name === 'HEAD' || refs.includes(name)) continue
    refs.push(name)
  }
  return refs
}

/**
 * Parse the `gh pr list --json …` answer into rows. A row without a positive
 * integer number is dropped; a field gh omitted becomes its zero value, and
 * output that is not a JSON array yields no rows.
 * @param output - the complete stdout of the one `gh pr list` invocation.
 * @returns pull requests in output order.
 */
export function parseGhPrs(output: string): readonly GhPr[] {
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const prs: GhPr[] = []
  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    const number = record['number']
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) continue
    const author = record['author']
    const login = typeof author === 'object' && author !== null
      ? (author as { login?: unknown }).login
      : undefined
    prs.push({
      number,
      title: typeof record['title'] === 'string' ? record['title'] : '',
      headRefName: typeof record['headRefName'] === 'string' ? record['headRefName'] : '',
      baseRefName: typeof record['baseRefName'] === 'string' ? record['baseRefName'] : '',
      isDraft: record['isDraft'] === true,
      updatedAt: typeof record['updatedAt'] === 'string' ? record['updatedAt'] : '',
      author: typeof login === 'string' ? login : '',
    })
  }
  return prs
}

/**
 * Read the account login out of `gh auth status` output. gh always follows
 * the login with its credential source in parentheses (`account NAME
 * (keyring)`); requiring that keeps arbitrary prose containing the word
 * "account" from being read as a login.
 * @param output - the combined stderr and stdout of `gh auth status`.
 * @returns the login, or `undefined` when the output names none.
 */
export function parseGhAccount(output: string): string | undefined {
  return /account\s+([A-Za-z0-9-]+)\s*\(/u.exec(output)?.[1]
}

/**
 * Read the pull-request URL out of `gh pr create` output, which prints prose
 * around the address; the last https URL is the address.
 * @param output - the complete stdout of the one `gh pr create` invocation.
 * @returns the URL, or `undefined` when the output contains none.
 */
export function parseGhPrUrl(output: string): string | undefined {
  let last: string | undefined
  for (const match of output.matchAll(/https:\/\/\S+/gu)) last = match[0]
  return last
}

/**
 * Read the pull-request number at the end of one github.com pull-request URL.
 * @param url - a URL `gh pr create` printed.
 * @returns the number, or `undefined` when the URL ends in no `pull/<digits>`.
 */
export function parseGhPrNumber(url: string): number | undefined {
  const digits = /\/pull\/(\d+)\/?$/u.exec(url)?.[1]
  return digits === undefined ? undefined : Number.parseInt(digits, 10)
}

/**
 * The first non-empty trimmed line of one command output; gh and git failures
 * are multi-line and the first line names the problem.
 * @param output - any decoded command output.
 * @returns the first non-blank line, or `undefined` when every line is blank.
 */
export function firstLine(output: string): string | undefined {
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed !== '') return trimmed
  }
  return undefined
}
