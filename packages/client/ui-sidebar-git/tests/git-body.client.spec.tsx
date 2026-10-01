// @vitest-environment jsdom
/**
 * The body against a static scripted remote.
 *
 * What is asserted is what the person sees and what the face was asked: the
 * probe's three outcomes, the header's branch, position, and remote actions,
 * the three change sections with their rows and context menu, the inline diff
 * with its sides and coloring, the commit box's guard and stage-all hint, the
 * branch list with its create form, and the GitHub section's sign-in, list,
 * merge, and create flows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, within } from '@testing-library/react'
import { RemoteError } from '@qilin/client-test-runtime'
import type { GhPr, GitBranches, GitStatus } from '@qilin/api-workspace-git/types'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import { zh } from '../src/client/locales.ts'
import { mountBody, SESSION, TAB } from './mount.client.tsx'
import { CLEAN_STATUS, DIRTY_STATUS } from './scripted-git.client.ts'

/** The host clipboard write, mocked so a copy lands somewhere observable. */
const clipboard = vi.hoisted(() => ({ write: vi.fn().mockResolvedValue(true) }))
vi.mock('@qilin/client-ui-primitives/src/clipboard.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qilin/client-ui-primitives/src/clipboard.ts')>()
  return { ...actual, writeClipboard: clipboard.write }
})

/** A branch with no upstream configured. */
const NO_UPSTREAM: GitStatus = {
  branch: 'solo',
  entries: [{ path: 'src/c.ts', index: ' ', worktree: 'M', staged: false, unstaged: true, untracked: false }],
}

/** An unborn or detached HEAD: no branch name to show. */
const UNBORN: GitStatus = { entries: [] }

/** One current branch with its upstream, one plain branch, and the cut flag. */
const BRANCHES: GitBranches = {
  branches: [
    { name: 'main', current: true, upstream: 'origin/main', ahead: 0, behind: 0 },
    { name: 'feature', current: false, ahead: 1, behind: 2 },
  ],
  truncated: true,
}

/** One draft pull request and one plain one. */
const PRS: readonly GhPr[] = [
  { number: 7, title: 'Fix the panel', headRefName: 'fix', baseRefName: 'main', isDraft: true, updatedAt: '', author: 'a' },
  { number: 8, title: 'Docs', headRefName: 'docs', baseRefName: 'main', isDraft: false, updatedAt: '', author: 'b' },
]

const REJECTED: RemoteFailure = new RemoteError('workspace-git/command-failed', 'exit 1', {
  command: 'git commit', code: 1, stderr: 'nothing to commit',
})

afterEach(() => { cleanup(); clipboard.write.mockClear() })

/** Let every already-started read or mutation settle and the panel redraw. */
async function flush(): Promise<void> {
  await act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve() })
}

describe('GitBody probe', () => {
  it('reads while it waits, then draws the panel the status settled on', async () => {
    const { view, script } = mountBody()
    expect(view.container.querySelector('[data-git-state="loading"]')?.textContent).toBe(zh.loading)
    await flush()
    expect(script.mocks.isRepo).toHaveBeenCalledWith(SESSION, expect.any(AbortSignal))
    expect(view.container.querySelector('[data-git-state="ready"]')).not.toBeNull()
  })

  it('says so when the workspace holds no repository, and reads no status', async () => {
    const { view, script } = mountBody({ answers: { isRepo: { ok: true, value: false } } })
    await flush()
    expect(view.container.querySelector('[data-git-state="empty"]')?.textContent).toBe(zh.notRepo)
    expect(script.mocks.status).not.toHaveBeenCalled()
  })

  it('shows why the probe could not answer', async () => {
    const transport = new RemoteError('gateway/internal', 'socket closed', {})
    const { view } = mountBody({ answers: { isRepo: { ok: false, error: transport } } })
    await flush()
    expect(view.container.querySelector('[data-git-state="failed"]')?.textContent)
      .toBe(zh['error.other'].replace('{message}', 'socket closed'))
  })

  it('asks nothing for a tab record that already ended', () => {
    const { view, script } = mountBody({ aborted: true })
    expect(view.container.textContent).toBe('')
    expect(script.mocks.isRepo).not.toHaveBeenCalled()
  })
})

describe('GitBody header', () => {
  it('names the branch and its position, and runs the remote actions', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    expect(view.container.querySelector('[data-git-branch]')?.textContent).toBe('feature')
    expect(view.container.innerHTML).toContain('↑2')
    expect(view.container.innerHTML).toContain('↓1')

    fireEvent.click(view.getByRole('button', { name: zh.pull }))
    await flush()
    expect(script.mocks.pull).toHaveBeenCalledWith(SESSION, expect.any(AbortSignal))
    fireEvent.click(view.getByRole('button', { name: zh.push }))
    await flush()
    expect(script.mocks.push).toHaveBeenCalledWith(SESSION, false, expect.any(AbortSignal))
    fireEvent.click(view.getByRole('button', { name: zh.refresh }))
    await flush()
    expect(script.mocks.status).toHaveBeenCalledTimes(4)
  })

  it('rests pull and offers the set-upstream push without an upstream', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: NO_UPSTREAM } } })
    await flush()
    expect(view.container.querySelector('[data-git-branch]')?.textContent).toBe('solo')
    expect(view.container.textContent).toContain(zh['upstream.none'])
    expect((view.getByRole('button', { name: zh.pull }) as HTMLButtonElement).disabled).toBe(true)
    const push = view.container.querySelector('[data-git-push-upstream="true"]')
    expect(push?.textContent).toBe(zh.pushSetUpstream)
    fireEvent.click(push!)
    await flush()
    expect(script.mocks.push).toHaveBeenCalledWith(SESSION, true, expect.any(AbortSignal))
  })

  it('carries one shared failure line by its code, retiring it on the next action', async () => {
    const { view, script } = mountBody({ answers: { pull: { ok: false, error: REJECTED } } })
    await flush()
    fireEvent.click(view.getByRole('button', { name: zh.pull }))
    await flush()
    const line = view.container.querySelector('[data-git-failure]')
    expect(line?.textContent).toBe(zh['error.commandFailed'].replace('{command}', 'git commit'))
    expect(script.mocks.pull).toHaveBeenCalledTimes(1)
  })
})

describe('GitBody changes', () => {
  it('groups the entries into their three sections with their badge letters', async () => {
    const { view } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    const section = (id: string): HTMLElement => view.container.querySelector(`[data-git-section="${id}"]`) as HTMLElement
    expect(section('unstaged').textContent).toContain(zh['changes.unstaged'])
    expect(within(section('unstaged')).getByText('src/b.ts')).not.toBeNull()
    expect(within(section('unstaged')).getByText('src/a.ts')).not.toBeNull()
    expect(within(section('staged')).getByText('src/a.ts')).not.toBeNull()
    expect(within(section('untracked')).getByText('notes/c.txt')).not.toBeNull()
    expect(section('untracked').querySelector('[data-git-path="notes/c.txt"] [data-git-badge]')?.textContent).toBe('?')
  })

  it('says each section is empty for a clean tree, and rests the commit', async () => {
    const { view } = mountBody()
    await flush()
    for (const id of ['unstaged', 'staged', 'untracked']) {
      expect(view.container.querySelector(`[data-git-section="${id}"] [data-git-row="empty"]`)?.textContent)
        .toBe(zh['changes.empty'])
    }
    expect((view.getByRole('button', { name: zh['commit.button'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('stages and unstages a whole section from its header', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    const unstaged = view.container.querySelector('[data-git-section="unstaged"]') as HTMLElement
    fireEvent.click(within(unstaged).getByRole('button', { name: zh.stage }))
    await flush()
    expect(script.mocks.stage).toHaveBeenCalledWith(SESSION, '', expect.any(AbortSignal))
    const staged = view.container.querySelector('[data-git-section="staged"]') as HTMLElement
    fireEvent.click(within(staged).getByRole('button', { name: zh.unstage }))
    await flush()
    expect(script.mocks.unstage).toHaveBeenCalledWith(SESSION, '', expect.any(AbortSignal))
  })

  it('a tracked row right-click offers stage, discard, and copy; an untracked row drops discard', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    const row = view.container.querySelector('[data-git-path="src/b.ts"]') as HTMLElement
    act(() => { fireEvent.contextMenu(row, { clientX: 10, clientY: 20 }) })
    fireEvent.click(view.getByRole('menuitem', { name: zh.stage }))
    await flush()
    expect(script.mocks.stage).toHaveBeenCalledWith(SESSION, 'src/b.ts', expect.any(AbortSignal))

    act(() => { fireEvent.contextMenu(view.container.querySelector('[data-git-path="src/b.ts"]') as HTMLElement) })
    fireEvent.click(view.getByRole('menuitem', { name: zh.discard }))
    await flush()
    expect(script.mocks.discard).toHaveBeenCalledWith(SESSION, 'src/b.ts', expect.any(AbortSignal))

    act(() => { fireEvent.contextMenu(view.container.querySelector('[data-git-path="notes/c.txt"]') as HTMLElement) })
    expect(view.queryByRole('menuitem', { name: zh.discard })).toBeNull()
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.copyPath'] }))
    expect(clipboard.write).toHaveBeenCalledWith('notes/c.txt')
    expect(view.queryByRole('menuitem')).toBeNull()
  })

  it('a right-click menu closes on Escape without choosing a row', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    act(() => { fireEvent.contextMenu(view.container.querySelector('[data-git-path="src/b.ts"]') as HTMLElement) })
    expect(view.getAllByRole('menuitem').length).toBeGreaterThan(0)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByRole('menuitem', { name: zh.stage })).toBeNull()
    expect(script.mocks.stage).not.toHaveBeenCalled()
  })

  it('a staged row right-click offers unstage instead of stage', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    act(() => { fireEvent.contextMenu(view.container.querySelector('[data-git-section="staged"] [data-git-path="src/a.ts"]') as HTMLElement) })
    expect(view.queryByRole('menuitem', { name: zh.stage })).toBeNull()
    fireEvent.click(view.getByRole('menuitem', { name: zh.unstage }))
    await flush()
    expect(script.mocks.unstage).toHaveBeenCalledWith(SESSION, 'src/a.ts', expect.any(AbortSignal))
  })
})

describe('GitBody diff', () => {
  const DIFF = 'diff --git a/src/a.ts b/src/a.ts\nindex 1f2..3e4 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n context\n\n+added\n-removed'

  it('a row click opens the diff below, colored by line kind, and closes again', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS }, diff: { ok: true, value: DIFF } } })
    await flush()
    fireEvent.click(view.container.querySelector('[data-git-path="src/b.ts"]') as HTMLElement)
    await flush()
    expect(script.mocks.diff).toHaveBeenCalledWith(SESSION, 'src/b.ts', false, expect.any(AbortSignal))
    const section = view.container.querySelector('[data-git-section="diff"]') as HTMLElement
    expect(section.querySelector('[data-git-diff]')?.textContent).toContain('+added')
    expect(section.querySelector('[data-git-diff-line="add"]')?.textContent).toBe('+added')
    expect(section.querySelector('[data-git-diff-line="del"]')?.textContent).toBe('-removed')
    expect(section.querySelector('[data-git-diff-line="hunk"]')?.textContent).toContain('@@')
    expect(section.querySelector('[data-git-diff-line="meta"]')?.textContent).toContain('diff --git')

    fireEvent.click(within(section).getByRole('button', { name: zh['diff.copy'] }))
    expect(clipboard.write).toHaveBeenCalledWith(DIFF)
    await flush()
    expect(within(section).getByRole('button', { name: zh['diff.copied'] })).not.toBeNull()
    // The empty context line keeps its height as a no-break space.
    expect(section.querySelector('[data-git-diff]')?.textContent).toContain('\u00a0')

    fireEvent.click(within(section).getByRole('button', { name: zh['diff.close'] }))
    expect(view.container.querySelector('[data-git-section="diff"]')).toBeNull()
  })

  it('the staged toggle re-reads the other side of the same path', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    fireEvent.click(view.container.querySelector('[data-git-section="staged"] [data-git-path="src/a.ts"]') as HTMLElement)
    await flush()
    expect(script.mocks.diff).toHaveBeenLastCalledWith(SESSION, 'src/a.ts', true, expect.any(AbortSignal))
    fireEvent.click(view.container.querySelector('[data-git-diff-toggle]') as HTMLElement)
    await flush()
    expect(script.mocks.diff).toHaveBeenLastCalledWith(SESSION, 'src/a.ts', false, expect.any(AbortSignal))
  })

  it('says an empty diff and a refused one each in their own words', async () => {
    const empty = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS }, diff: { ok: true, value: '' } } })
    await flush()
    fireEvent.click(empty.view.container.querySelector('[data-git-path="src/b.ts"]') as HTMLElement)
    await flush()
    expect(empty.view.container.querySelector('[data-git-section="diff"] [data-git-row="empty"]')?.textContent)
      .toBe(zh['diff.empty'])

    const refused = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS }, diff: { ok: false, error: REJECTED } } })
    await flush()
    fireEvent.click(refused.view.container.querySelector('[data-git-path="src/b.ts"]') as HTMLElement)
    await flush()
    const section = refused.view.container.querySelector('[data-git-section="diff"]') as HTMLElement
    expect(section.textContent).toContain(zh['error.commandFailed'].replace('{command}', 'git commit'))
    expect(within(section).getByRole('button', { name: zh['diff.copy'] }).hasAttribute('disabled')).toBe(true)
  })
})

describe('GitBody commit box', () => {
  async function boxOf(status: GitStatus) {
    const mounted = mountBody({ answers: { status: { ok: true, value: status } } })
    await flush()
    return mounted
  }

  it('rests on an empty trim, hints, and refuses a clean tree even with text', async () => {
    const dirty = await boxOf(NO_UPSTREAM)
    const input = dirty.view.container.querySelector('[data-git-commit-input]') as HTMLTextAreaElement
    expect((dirty.view.getByRole('button', { name: zh['commit.button'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(dirty.view.container.textContent).toContain(zh['commit.emptyHint'])
    // With text typed over an untouched index, the hint turns to stage-all.
    fireEvent.change(input, { target: { value: 'ship' } })
    expect(dirty.view.container.textContent).toContain(zh['commit.autoStage'])
    dirty.view.unmount()

    const clean = await boxOf(CLEAN_STATUS)
    fireEvent.change(clean.view.container.querySelector('[data-git-commit-input]') as HTMLElement, { target: { value: 'nothing' } })
    expect((clean.view.getByRole('button', { name: zh['commit.button'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('commits the draft, clearing the box on success', async () => {
    const { view, script, instance } = await boxOf(DIRTY_STATUS)
    const input = view.container.querySelector('[data-git-commit-input]') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '  fix  ' } })
    expect(script.mocks.stage).not.toHaveBeenCalled()
    fireEvent.click(view.container.querySelector('[data-git-commit]') as HTMLElement)
    await flush()
    expect(script.mocks.commit).toHaveBeenCalledWith(SESSION, 'fix', expect.any(AbortSignal))
    expect(instance.getSnapshot().byTab[TAB]?.commitDraft).toBe('')
  })

  it('stages everything first when the index is untouched', async () => {
    const { view, script } = await boxOf(NO_UPSTREAM)
    fireEvent.change(view.container.querySelector('[data-git-commit-input]') as HTMLElement, { target: { value: 'ship' } })
    fireEvent.keyDown(view.container.querySelector('[data-git-commit-input]') as HTMLElement, { key: 'Enter', ctrlKey: true })
    await flush()
    expect(script.mocks.stage).toHaveBeenCalledWith(SESSION, '', expect.any(AbortSignal))
    expect(script.mocks.commit).toHaveBeenCalledWith(SESSION, 'ship', expect.any(AbortSignal))
  })

  it('an empty trim through the keyboard asks nothing', async () => {
    const { view, script } = await boxOf(NO_UPSTREAM)
    fireEvent.keyDown(view.container.querySelector('[data-git-commit-input]') as HTMLElement, { key: 'Enter', ctrlKey: true })
    await flush()
    expect(script.mocks.commit).not.toHaveBeenCalled()
    expect(script.mocks.stage).not.toHaveBeenCalled()
  })

  it('submits on Ctrl-Enter or Meta-Enter, and a bare Enter types on', async () => {
    const { view, script } = await boxOf(DIRTY_STATUS)
    const input = view.container.querySelector('[data-git-commit-input]') as HTMLElement
    fireEvent.change(input, { target: { value: 'one' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await flush()
    expect(script.mocks.commit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape', ctrlKey: true })
    await flush()
    expect(script.mocks.commit).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'two' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await flush()
    expect(script.mocks.commit).toHaveBeenCalledWith(SESSION, 'two', expect.any(AbortSignal))
  })

  it('keeps the draft when the commit is refused', async () => {
    const { view, script, instance } = await boxOf(DIRTY_STATUS)
    fireEvent.change(view.container.querySelector('[data-git-commit-input]') as HTMLElement, { target: { value: 'blocked' } })
    script.mocks.commit.mockResolvedValueOnce({ ok: false, error: REJECTED })
    fireEvent.click(view.container.querySelector('[data-git-commit]') as HTMLElement)
    await flush()
    expect(instance.getSnapshot().byTab[TAB]?.commitDraft).toBe('blocked')
    expect(view.container.querySelector('[data-git-failure]')?.getAttribute('data-git-failure'))
      .toBe('workspace-git/command-failed')
  })
})

describe('GitBody branches', () => {
  it('expands into the branch list, marking the current branch and its tracking', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS }, branches: { ok: true, value: BRANCHES } } })
    await flush()
    const toggle = view.getByRole('button', { name: zh['branches.title'] })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    await flush()
    expect(script.mocks.branches).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[data-git-branch="main"]')?.textContent)
      .toContain(zh['branches.current'])
    expect(view.container.querySelector('[data-git-branch="main"]')?.textContent)
      .toContain(zh['branches.tracking'].replace('{upstream}', 'origin/main').replace('{ahead}', '0').replace('{behind}', '0'))
    expect(view.container.textContent).toContain(zh['branches.truncated'])
    expect((view.container.querySelector('[data-git-branch="main"]') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(view.container.querySelector('[data-git-branch="feature"]') as HTMLElement)
    await flush()
    expect(script.mocks.checkout).toHaveBeenCalledWith(SESSION, 'feature', expect.any(AbortSignal))
    // The checkout re-reads the list; collapsing and reopening keeps it.
    expect(script.mocks.branches).toHaveBeenCalledTimes(2)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    await flush()
    expect(script.mocks.branches).toHaveBeenCalledTimes(2)
  })

  it('expands once and says the list is empty, or why it could not answer', async () => {
    const empty = mountBody()
    await flush()
    fireEvent.click(empty.view.getByRole('button', { name: zh['branches.title'] }))
    await flush()
    expect(empty.view.container.querySelector('[data-git-section="branches"] [data-git-row="empty"]')?.textContent)
      .toBe(zh['branches.empty'])
    empty.view.unmount()

    const refused = mountBody({ answers: { branches: { ok: false, error: REJECTED } } })
    await flush()
    fireEvent.click(refused.view.getByRole('button', { name: zh['branches.title'] }))
    await flush()
    expect(refused.view.container.querySelector('[data-git-section="branches"]')?.textContent)
      .toContain(zh['error.commandFailed'].replace('{command}', 'git commit'))
  })

  it('creates a branch from its inline form, refusing an empty name', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS } } })
    await flush()
    fireEvent.click(view.getByRole('button', { name: zh['branches.title'] }))
    await flush()
    const section = view.container.querySelector('[data-git-section="branches"]') as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: zh['branches.create'] }))
    fireEvent.change(view.container.querySelector('[data-git-branch-name]') as HTMLElement, { target: { value: '  feature  ' } })
    fireEvent.change(view.container.querySelector('[data-git-branch-from]') as HTMLElement, { target: { value: ' main ' } })
    fireEvent.click(within(section).getByRole('button', { name: zh['branches.createButton'] }))
    await flush()
    expect(script.mocks.createBranch).toHaveBeenCalledWith(SESSION, 'feature', 'main', expect.any(AbortSignal))
    expect(view.container.querySelector('[data-git-branch-name]')).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: zh['branches.create'] }))
    expect(within(section).getByRole('button', { name: zh['branches.createButton'] }).hasAttribute('disabled')).toBe(true)
    // Enter in the name field submits too, and an empty name asks nothing.
    fireEvent.keyDown(view.container.querySelector('[data-git-branch-name]') as HTMLElement, { key: 'Tab' })
    fireEvent.keyDown(view.container.querySelector('[data-git-branch-name]') as HTMLElement, { key: 'Enter' })
    await flush()
    expect(script.mocks.createBranch).toHaveBeenCalledTimes(1)
    fireEvent.change(view.container.querySelector('[data-git-branch-name]') as HTMLElement, { target: { value: 'release' } })
    fireEvent.keyDown(view.container.querySelector('[data-git-branch-name]') as HTMLElement, { key: 'Enter' })
    await flush()
    expect(script.mocks.createBranch).toHaveBeenLastCalledWith(SESSION, 'release', '', expect.any(AbortSignal))
    expect(view.container.querySelector('[data-git-branch-name]')).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: zh['branches.create'] }))
    fireEvent.click(within(section).getByRole('button', { name: zh['branches.cancel'] }))
    expect(view.container.querySelector('[data-git-branch-name]')).toBeNull()
  })
})

describe('GitBody GitHub section', () => {
  it('stays hidden unless gh answers a plain yes', async () => {
    const { view } = mountBody({ answers: { ghAvailable: { ok: true, value: false } } })
    await flush()
    expect(view.container.querySelector('[data-git-section="github"]')).toBeNull()
  })

  it('expands into the signed-in list with its filters, draft mark, and refs', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS }, ghListPrs: { ok: true, value: PRS } } })
    await flush()
    fireEvent.click(view.getByRole('button', { name: zh['gh.title'] }))
    await flush()
    expect(script.mocks.ghAuthStatus).toHaveBeenCalledWith(SESSION, expect.any(AbortSignal))
    expect(script.mocks.ghListPrs).toHaveBeenCalledWith(SESSION, 'open', expect.any(AbortSignal))
    const row = view.container.querySelector('[data-git-pr="7"]') as HTMLElement
    expect(row.textContent).toContain('#7')
    expect(row.textContent).toContain('Fix the panel')
    expect(row.textContent).toContain(zh['gh.draft'])
    expect(row.textContent).toContain(zh['gh.prMeta'].replace('{head}', 'fix').replace('{base}', 'main'))
    expect(view.container.querySelector('[data-git-filter="open"]')?.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(view.container.querySelector('[data-git-filter="closed"]') as HTMLElement)
    await flush()
    expect(script.mocks.ghListPrs).toHaveBeenLastCalledWith(SESSION, 'closed', expect.any(AbortSignal))
    // The filter already shown re-asks nothing.
    fireEvent.click(view.container.querySelector('[data-git-filter="closed"]') as HTMLElement)
    await flush()
    expect(script.mocks.ghListPrs).toHaveBeenCalledTimes(2)
  })

  it('words the sign-in hint with gh\'s message and offers to recheck', async () => {
    const { view, script } = mountBody({ answers: { ghAuthStatus: { ok: true, value: { authenticated: false, message: 'not logged in' } } } })
    await flush()
    const toggle = view.getByRole('button', { name: zh['gh.title'] })
    fireEvent.click(toggle)
    await flush()
    expect(view.container.querySelector('[data-git-section="github"]')?.textContent)
      .toContain(zh['gh.signedOut'].replace('{message}', 'not logged in'))
    expect(script.mocks.ghListPrs).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: zh['gh.recheck'] }))
    await flush()
    expect(script.mocks.ghAuthStatus).toHaveBeenCalledTimes(2)
    // Collapsing hides the section; reopening a signed-out section re-probes nothing.
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    await flush()
    expect(script.mocks.ghAuthStatus).toHaveBeenCalledTimes(2)
    expect(view.container.querySelector('[data-git-section="github"]')?.textContent)
      .toContain(zh['gh.signedOut'].replace('{message}', 'not logged in'))
  })

  it('says the list is empty, or why it could not answer', async () => {
    const empty = mountBody()
    await flush()
    fireEvent.click(empty.view.getByRole('button', { name: zh['gh.title'] }))
    await flush()
    expect(empty.view.container.querySelector('[data-git-section="github"] [data-git-row="empty"]')?.textContent)
      .toBe(zh['gh.empty'])
    empty.view.unmount()

    const refused = mountBody({ answers: { ghListPrs: { ok: false, error: REJECTED } } })
    await flush()
    fireEvent.click(refused.view.getByRole('button', { name: zh['gh.title'] }))
    await flush()
    expect(refused.view.container.querySelector('[data-git-section="github"] [data-git-failure]')?.textContent)
      .toContain(zh['error.commandFailed'].replace('{command}', 'git commit'))
  })

  it('merges one pull request the chosen way, or cancels', async () => {
    const { view, script } = mountBody({ answers: { ghListPrs: { ok: true, value: PRS } } })
    await flush()
    fireEvent.click(view.getByRole('button', { name: zh['gh.title'] }))
    await flush()
    const row = view.container.querySelector('[data-git-pr="7"]') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: zh['gh.merge'] }))
    fireEvent.change(view.container.querySelector('[data-git-section="github"] select') as HTMLElement, { target: { value: 'squash' } })
    fireEvent.click(within(row).getByRole('button', { name: zh['gh.merge'] }))
    await flush()
    expect(script.mocks.ghMergePr).toHaveBeenCalledWith(SESSION, 7, 'squash', expect.any(AbortSignal))
    expect(script.mocks.ghListPrs).toHaveBeenLastCalledWith(SESSION, 'open', expect.any(AbortSignal))

    fireEvent.click(within(view.container.querySelector('[data-git-pr="8"]') as HTMLElement).getByRole('button', { name: zh['gh.merge'] }))
    fireEvent.click(within(view.container.querySelector('[data-git-pr="8"]') as HTMLElement).getByRole('button', { name: zh['gh.cancel'] }))
    expect(script.mocks.ghMergePr).toHaveBeenCalledTimes(1)
  })

  it('creates one pull request with the current branch prefilled as its base', async () => {
    const { view, script } = mountBody({ answers: { status: { ok: true, value: DIRTY_STATUS }, ghListPrs: { ok: true, value: PRS } } })
    await flush()
    fireEvent.click(view.getByRole('button', { name: zh['gh.title'] }))
    await flush()
    fireEvent.click(within(view.container.querySelector('[data-git-section="github"]') as HTMLElement).getByRole('button', { name: zh['gh.create'] }))
    expect((view.container.querySelector('[data-git-pr-base]') as HTMLInputElement).value).toBe('feature')
    // Cancel closes the form without asking; reopening starts it fresh.
    fireEvent.click(within(view.container.querySelector('[data-git-section="github"]') as HTMLElement).getByRole('button', { name: zh['gh.cancel'] }))
    expect(view.container.querySelector('[data-git-pr-title]')).toBeNull()
    fireEvent.click(within(view.container.querySelector('[data-git-section="github"]') as HTMLElement).getByRole('button', { name: zh['gh.create'] }))
    expect((view.container.querySelector('[data-git-pr-base]') as HTMLInputElement).value).toBe('feature')
    fireEvent.change(view.container.querySelector('[data-git-pr-title]') as HTMLElement, { target: { value: '  Fix  ' } })
    fireEvent.change(view.container.querySelector('[data-git-pr-body]') as HTMLElement, { target: { value: ' The fix ' } })
    fireEvent.change(view.container.querySelector('[data-git-pr-base]') as HTMLElement, { target: { value: ' main ' } })
    fireEvent.click(within(view.container.querySelector('[data-git-section="github"]') as HTMLElement).getByRole('button', { name: zh['gh.createButton'] }))
    await flush()
    expect(script.mocks.ghCreatePr).toHaveBeenCalledWith(SESSION, 'Fix', 'The fix', 'main', expect.any(AbortSignal))
    expect(view.container.querySelector('[data-git-pr-title]')).toBeNull()

    const notice = view.container.querySelector('[data-git-notice]') as HTMLElement
    expect(notice.textContent).toContain(zh['gh.created'].replace('{number}', '7'))
    fireEvent.click(within(notice).getByRole('button', { name: zh['gh.copyUrl'] }))
    expect(clipboard.write).toHaveBeenCalledWith('https://example.com/pull/7')
    await flush()
    expect(within(notice).getByRole('button', { name: zh['gh.copiedUrl'] })).not.toBeNull()
    fireEvent.click(within(notice).getByRole('button', { name: zh['gh.dismiss'] }))
    expect(view.container.querySelector('[data-git-notice]')).toBeNull()
  })

  it('names an unborn or detached HEAD, and the pull-request base starts empty', async () => {
    const { view } = mountBody({ answers: { status: { ok: true, value: UNBORN } } })
    await flush()
    expect(view.container.querySelector('[data-git-branch]')?.textContent).toBe(zh.noBranch)
    fireEvent.click(view.getByRole('button', { name: zh['gh.title'] }))
    await flush()
    fireEvent.click(within(view.container.querySelector('[data-git-section="github"]') as HTMLElement).getByRole('button', { name: zh['gh.create'] }))
    expect((view.container.querySelector('[data-git-pr-base]') as HTMLInputElement).value).toBe('')
  })
})
