/**
 * Pure parsers for the fixed git formats this service consumes. Each takes a
 * recorded output string and returns wire values with no filesystem or
 * process access, so fixtures in `tests/parse.spec.ts` pin the grammar.
 * @module @qilin/api-workspace-git
 */

import type { GitBranch, GitStatusEntry, GitUpstream } from './types.ts'

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
