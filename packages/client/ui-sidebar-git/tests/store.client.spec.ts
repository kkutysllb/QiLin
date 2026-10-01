/**
 * The panel's write set: what each action leaves in its tab's bucket, and the
 * guards that keep a stale settlement from overwriting a newer read.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { GhPr, GitStatus } from '@qilin/api-workspace-git/types'
import type { TabId } from '@qilin/client-ui-dockkit'
import { createGitStore } from '../src/client/store.ts'

const TAB = 'tab-1' as TabId
const OTHER = 'tab-2' as TabId

const FAILURE: RemoteFailure = new RemoteError('workspace-git/command-failed', 'exit 1', {
  command: 'git status', code: 1, stderr: 'fatal: not a git repository',
})
const STATUS: GitStatus = { branch: 'main', entries: [] }
const PR: GhPr = {
  number: 7, title: 'Fix', headRefName: 'fix', baseRefName: 'main', isDraft: false, updatedAt: '', author: '',
}

/** A live store instance seeded with one started tab. */
function mounted() {
  const instance = createGitStore().create()
  instance.actions.start(TAB)
  return instance
}

describe('createGitStore', () => {
  it('seeds one probing bucket per start', () => {
    const instance = mounted()
    instance.actions.start(OTHER)
    expect(instance.getSnapshot().byTab[TAB]).toEqual({
      repo: { kind: 'probing' },
      busy: false,
      failure: undefined,
      commitDraft: '',
      branches: undefined,
      diff: undefined,
      gh: { kind: 'probing' },
      prs: { kind: 'idle' },
      created: undefined,
    })
    expect(instance.getSnapshot().byTab[OTHER]?.repo).toEqual({ kind: 'probing' })
  })

  it('refuses writes for a tab that never started', () => {
    const instance = createGitStore().create()
    expect(() => { instance.actions.repoEmpty(TAB) }).toThrow(/no panel for tab/)
  })

  it('records the probe outcomes and the settled status', () => {
    const instance = mounted()
    instance.actions.repoEmpty(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.repo).toEqual({ kind: 'empty' })
    instance.actions.repoFailed(TAB, FAILURE)
    expect(instance.getSnapshot().byTab[TAB]?.repo).toEqual({ kind: 'failed', failure: FAILURE })
    instance.actions.statusSettled(TAB, STATUS)
    expect(instance.getSnapshot().byTab[TAB]?.repo).toEqual({ kind: 'ready', status: STATUS })
  })

  it('keeps the panel a refresh failure cannot answer, reporting beside it', () => {
    const instance = mounted()
    instance.actions.statusSettled(TAB, STATUS)
    instance.actions.statusFailed(TAB, FAILURE)
    expect(instance.getSnapshot().byTab[TAB]?.repo).toEqual({ kind: 'ready', status: STATUS })
    expect(instance.getSnapshot().byTab[TAB]?.failure).toBe(FAILURE)
  })

  it('lets a failed first status take the panel over', () => {
    const instance = mounted()
    instance.actions.statusFailed(TAB, FAILURE)
    expect(instance.getSnapshot().byTab[TAB]?.repo).toEqual({ kind: 'failed', failure: FAILURE })
  })

  it('rides one mutation through busy, settled, and failed', () => {
    const instance = mounted()
    instance.actions.statusSettled(TAB, STATUS)
    instance.actions.statusFailed(TAB, FAILURE)
    instance.actions.busy(TAB)
    expect(instance.getSnapshot().byTab[TAB]).toMatchObject({ busy: true, failure: undefined })
    instance.actions.failed(TAB, FAILURE)
    expect(instance.getSnapshot().byTab[TAB]).toMatchObject({ busy: false, failure: FAILURE })
    instance.actions.busy(TAB)
    instance.actions.settled(TAB)
    expect(instance.getSnapshot().byTab[TAB]).toMatchObject({ busy: false, failure: undefined })
  })

  it('tracks the commit draft and empties it on success', () => {
    const instance = mounted()
    instance.actions.busy(TAB)
    instance.actions.commitDraft(TAB, ' fix ')
    expect(instance.getSnapshot().byTab[TAB]?.commitDraft).toBe(' fix ')
    instance.actions.committed(TAB)
    expect(instance.getSnapshot().byTab[TAB]).toMatchObject({ commitDraft: '', busy: false })
  })

  it('carries the branch list through its phases', () => {
    const instance = mounted()
    instance.actions.branchesLoading(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.branches).toEqual({ kind: 'loading' })
    instance.actions.branchesFailed(TAB, FAILURE)
    expect(instance.getSnapshot().byTab[TAB]?.branches).toEqual({ kind: 'failed', failure: FAILURE })
    instance.actions.branchesSettled(TAB, [], true)
    expect(instance.getSnapshot().byTab[TAB]?.branches).toEqual({ kind: 'ready', branches: [], truncated: true })
  })

  it('lets only the read still open settle or fail the diff', () => {
    const instance = mounted()
    instance.actions.diffOpen(TAB, 'src/a.ts', false)
    instance.actions.diffClosed(TAB)
    // The read's settlement arrives after the diff was closed: nothing reopens.
    instance.actions.diffSettled(TAB, '+text')
    instance.actions.diffFailed(TAB, FAILURE)
    expect(instance.getSnapshot().byTab[TAB]?.diff).toBeUndefined()

    instance.actions.diffOpen(TAB, 'src/a.ts', true)
    instance.actions.diffFailed(TAB, FAILURE)
    instance.actions.diffSettled(TAB, '+text')
    // The failed read's late success changes nothing.
    expect(instance.getSnapshot().byTab[TAB]?.diff).toEqual({
      path: 'src/a.ts', staged: true, phase: { kind: 'failed', failure: FAILURE },
    })
  })

  it('walks the GitHub section through its probe, auth, and list phases', () => {
    const instance = mounted()
    instance.actions.ghOff(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.gh).toEqual({ kind: 'off' })
    instance.actions.ghOn(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.gh).toEqual({ kind: 'on' })
    instance.actions.ghAuthLoading(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.gh).toEqual({ kind: 'authLoading' })
    instance.actions.ghSignedOut(TAB, 'no token')
    expect(instance.getSnapshot().byTab[TAB]?.gh).toEqual({ kind: 'signedOut', message: 'no token' })
    instance.actions.ghReady(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.gh).toEqual({ kind: 'ready' })

    instance.actions.prsLoading(TAB, 'open')
    expect(instance.getSnapshot().byTab[TAB]?.prs).toEqual({ kind: 'loading', state: 'open' })
    instance.actions.prsFailed(TAB, 'all', FAILURE)
    expect(instance.getSnapshot().byTab[TAB]?.prs).toEqual({ kind: 'failed', state: 'all', failure: FAILURE })
    instance.actions.prsSettled(TAB, 'closed', [PR])
    expect(instance.getSnapshot().byTab[TAB]?.prs).toEqual({ kind: 'ready', state: 'closed', prs: [PR] })
  })

  it('stands the created notice up and takes it down', () => {
    const instance = mounted()
    instance.actions.busy(TAB)
    instance.actions.ghCreated(TAB, 7, 'https://example.com/pull/7')
    expect(instance.getSnapshot().byTab[TAB]).toMatchObject({
      busy: false, created: { number: 7, url: 'https://example.com/pull/7' },
    })
    instance.actions.ghNoticeClosed(TAB)
    expect(instance.getSnapshot().byTab[TAB]?.created).toBeUndefined()
  })

  it('forgets exactly the bucket it is asked for', () => {
    const instance = mounted()
    instance.actions.start(OTHER)
    instance.actions.forget(TAB)
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
    expect(instance.getSnapshot().byTab[OTHER]).toBeDefined()
  })
})
