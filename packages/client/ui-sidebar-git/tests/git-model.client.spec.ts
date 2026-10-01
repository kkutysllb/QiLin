/**
 * The panel's pure arithmetic: grouping, discarding, badge letters, diff line
 * kinds, and the failure wording of every Remote code the panel reports.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { GitStatusEntry } from '@qilin/api-workspace-git/types'
import { makeTranslate } from '@qilin/client-test-runtime'
import { zh } from '../src/client/locales.ts'
import { badgeOf, canDiscardEntry, diffLineKind, gitFailureLine, groupChanges } from '../src/client/git-model.ts'

const t = makeTranslate(zh)

/** One entry in its most compact form. */
function entry(path: string, mark: Partial<GitStatusEntry>): GitStatusEntry {
  return {
    path, index: ' ', worktree: ' ', staged: false, unstaged: false, untracked: false, ...mark,
  }
}

const STAGED = entry('src/a.ts', { index: 'M', staged: true })
const BOTH = entry('src/b.ts', { index: 'M', worktree: 'M', staged: true, unstaged: true })
const UNSTAGED = entry('src/c.ts', { worktree: 'M', unstaged: true })
const UNTRACKED = entry('notes/d.txt', { index: '?', worktree: '?', untracked: true })

describe('groupChanges', () => {
  it('splits the entries into their three sections in printed order', () => {
    const groups = groupChanges([UNSTAGED, BOTH, UNTRACKED, STAGED])
    expect(groups.staged).toEqual([BOTH, STAGED])
    expect(groups.unstaged).toEqual([UNSTAGED, BOTH])
    expect(groups.untracked).toEqual([UNTRACKED])
  })

  it('answers three empty sections for a clean tree', () => {
    expect(groupChanges([])).toEqual({ staged: [], unstaged: [], untracked: [] })
  })
})

describe('canDiscardEntry', () => {
  it('refuses untracked entries and allows every tracked one', () => {
    expect(canDiscardEntry(UNTRACKED)).toBe(false)
    expect(canDiscardEntry(STAGED)).toBe(true)
    expect(canDiscardEntry(UNSTAGED)).toBe(true)
  })
})

describe('badgeOf', () => {
  it('takes the index column, then the worktree column, then a bare question mark', () => {
    expect(badgeOf(STAGED)).toBe('M')
    expect(badgeOf(UNSTAGED)).toBe('M')
    expect(badgeOf(UNTRACKED)).toBe('?')
    expect(badgeOf(entry('e.ts', { index: '?', worktree: ' ', untracked: true }))).toBe('?')
  })
})

describe('diffLineKind', () => {
  it('classes the header, hunk, added, deleted, and untouched lines', () => {
    expect(diffLineKind('diff --git a/x b/x')).toBe('meta')
    expect(diffLineKind('index 1f2..3e4 100644')).toBe('meta')
    expect(diffLineKind('--- a/x')).toBe('meta')
    expect(diffLineKind('+++ b/x')).toBe('meta')
    expect(diffLineKind('@@ -1,2 +1,3 @@')).toBe('hunk')
    expect(diffLineKind('+added')).toBe('add')
    expect(diffLineKind('-removed')).toBe('del')
    expect(diffLineKind(' context')).toBe('context')
    expect(diffLineKind('')).toBe('context')
    expect(diffLineKind('+')).toBe('add')
  })
})

describe('gitFailureLine', () => {
  it('words each panel code with its own details', () => {
    const cases: readonly [RemoteFailure, string][] = [
      [new RemoteError('workspace-git/not-a-repo', 'no', {}), zh['error.notRepo']],
      [new RemoteError('workspace-git/bad-branch', 'bad', { branch: 'feat x' }), zh['error.badBranch'].replace('{branch}', 'feat x')],
      [new RemoteError('workspace-git/bad-message', 'bad', { length: 0 }), zh['error.badMessage'].replace('{length}', '0')],
      [new RemoteError('workspace-git/bad-path', 'bad', { path: '' }), zh['error.badPath'].replace('{path}', '')],
      [
        new RemoteError('workspace-git/bad-pr-title', 'bad', { field: 'title', length: 501 }),
        zh['error.badPrTitle'].replace('{field}', 'title').replace('{length}', '501'),
      ],
      [
        new RemoteError('workspace-git/too-large', 'big', { bytes: 11, maxBytes: 10 }),
        zh['error.tooLarge'].replace('{bytes}', '11').replace('{maxBytes}', '10'),
      ],
    ]
    for (const [failure, line] of cases) expect(gitFailureLine(t, failure).line).toBe(line)
  })

  it('carries the invocation and its stderr under a command failure', () => {
    const failure = new RemoteError('workspace-git/command-failed', 'exit 1', {
      command: 'git push', code: 1, stderr: 'rejected',
    })
    const answer = gitFailureLine(t, failure)
    expect(answer.line).toBe(zh['error.commandFailed'].replace('{command}', 'git push'))
    expect(answer.title).toBe('git push\nrejected')
  })

  it('falls through a code the panel does not know word-for-word', () => {
    const failure = new RemoteError('gateway/internal', 'socket closed', {})
    const answer = gitFailureLine(t, failure)
    expect(answer.line).toBe(zh['error.other'].replace('{message}', 'socket closed'))
    expect(answer.title).toBeUndefined()
  })
})
