/**
 * The panel's asynchronous half against scripted remotes.
 *
 * The face's contract is what reaches the store and when: the probe's
 * outcome, one mutation at a time with its failure recorded and its success
 * followed by a status read, reads with generations so the latest request of
 * a tab wins, the commit box's stage-all semantics, and the GitHub section's
 * auth, list, create, and merge flows.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import type { TabId } from '@qilin/client-ui-dockkit'
import { createGitReader, gitFace } from '../src/client/face.ts'
import { createGitStore } from '../src/client/store.ts'
import { CLEAN_STATUS, DIRTY_STATUS, flush, gatedGit, staticGit } from './scripted-git.client.ts'
import type { GatedGit, StaticGit } from './scripted-git.client.ts'

const SESSION = 's-1' as SessionId
const TAB = 'tab-1' as TabId

const SIGNAL = new AbortController().signal
const REJECTED: RemoteFailure = new RemoteError('workspace-git/command-failed', 'exit 1', {
  command: 'git push', code: 1, stderr: 'rejected',
})
const TRANSPORT: RemoteFailure = new RemoteError('gateway/internal', 'socket closed', {})

/** One store instance and the face bound to it. */
function mount(script: StaticGit | GatedGit) {
  const instance = createGitStore().create()
  return { instance, face: gitFace(createGitReader(script.remote))(SESSION, instance.actions) }
}

/** The tab's bucket, as the specs read it. */
function bucketOf(instance: ReturnType<typeof mount>['instance']) {
  return instance.getSnapshot().byTab[TAB]
}

describe('createGitReader', () => {
  it('hands the workspaceGit namespace to the panel unchanged', () => {
    const script = staticGit()
    expect(createGitReader(script.remote)).toBe(script.remote.workspaceGit)
  })
})

describe('gitFace start', () => {
  it('probes, reads the first status, and lights the GitHub section', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'ready', status: CLEAN_STATUS })
    expect(bucketOf(instance)?.gh).toEqual({ kind: 'on' })
    expect(script.mocks.isRepo).toHaveBeenCalledWith(SESSION, SIGNAL)
    expect(script.mocks.status).toHaveBeenCalledWith(SESSION, SIGNAL)
  })

  it('stops at the empty state for a workspace without a repository', async () => {
    const script = staticGit({ isRepo: { ok: true, value: false } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'empty' })
    expect(script.mocks.status).not.toHaveBeenCalled()
    expect(bucketOf(instance)?.gh).toEqual({ kind: 'probing' })
  })

  it('takes the panel over when the probe cannot answer', async () => {
    const script = staticGit({ isRepo: { ok: false, error: TRANSPORT } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'failed', failure: TRANSPORT })
  })

  it('hides the GitHub section unless gh answers a plain yes', async () => {
    const absent = staticGit({ ghAvailable: { ok: true, value: false } })
    const withoutGh = mount(absent)
    withoutGh.face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(withoutGh.instance)?.gh).toEqual({ kind: 'off' })

    const broken = staticGit({ ghAvailable: { ok: false, error: TRANSPORT } })
    const unreachable = mount(broken)
    unreachable.face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(unreachable.instance)?.gh).toEqual({ kind: 'off' })
  })

  it('makes no request for a record that already ended', () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    const controller = new AbortController()
    controller.abort()
    face.start(TAB, controller.signal)
    expect(script.mocks.isRepo).not.toHaveBeenCalled()
    expect(bucketOf(instance)).toBeUndefined()
  })

  it('forgets the tab on abort, and a later settlement writes nothing back', async () => {
    const script = gatedGit()
    const { instance, face } = mount(script)
    const controller = new AbortController()
    face.start(TAB, controller.signal)
    expect(script.q.isRepo).toHaveLength(1)
    controller.abort()
    expect(bucketOf(instance)).toBeUndefined()
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    expect(bucketOf(instance)).toBeUndefined()
    expect(script.q.status).toHaveLength(0)
  })
})

describe('gitFace status reads', () => {
  it('lets a failed first read take the panel over, and a later refresh recover', async () => {
    const script = staticGit({ status: { ok: false, error: REJECTED } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'failed', failure: REJECTED })

    const recovered = staticGit()
    const second = mount(recovered)
    second.face.start(TAB, SIGNAL)
    await flush()
    second.face.refresh(TAB, SIGNAL)
    await flush()
    expect(recovered.mocks.status).toHaveBeenCalledTimes(2)
    expect(bucketOf(second.instance)?.repo).toEqual({ kind: 'ready', status: CLEAN_STATUS })
  })

  it('lets the latest read of a tab win, whichever settles first', async () => {
    const script = gatedGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    // The probe's status read (generation 1) still hangs; two refreshes later,
    // generation 3 settles first with the dirty tree.
    face.refresh(TAB, SIGNAL)
    face.refresh(TAB, SIGNAL)
    script.q.status[2]?.resolve({ ok: true, value: DIRTY_STATUS })
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'ready', status: DIRTY_STATUS })
    script.q.status[0]?.resolve({ ok: false, error: REJECTED })
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'ready', status: DIRTY_STATUS })
    expect(bucketOf(instance)?.failure).toBeUndefined()
  })
})

describe('gitFace mutations', () => {
  it('rides one path mutation through busy and its follow-up status read', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.busy).toBe(false)
    face.stage(TAB, 'src/a.ts', SIGNAL)
    await flush()
    expect(script.mocks.stage).toHaveBeenCalledWith(SESSION, 'src/a.ts', SIGNAL)
    expect(script.mocks.status).toHaveBeenCalledTimes(2)
    expect(bucketOf(instance)?.busy).toBe(false)
  })

  it('records a mutation failure beside the panel it leaves standing', async () => {
    const script = staticGit({ unstage: { ok: false, error: REJECTED } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.unstage(TAB, '', SIGNAL)
    await flush()
    expect(script.mocks.unstage).toHaveBeenCalledWith(SESSION, '', SIGNAL)
    expect(bucketOf(instance)).toMatchObject({ busy: false, failure: REJECTED })
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'ready', status: CLEAN_STATUS })
  })

  it('discards through the same one-at-a-time path', async () => {
    const script = staticGit()
    const { face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.discard(TAB, 'src/b.ts', SIGNAL)
    await flush()
    expect(script.mocks.discard).toHaveBeenCalledWith(SESSION, 'src/b.ts', SIGNAL)
  })

  it('pushes with and without the upstream flag, and pulls', async () => {
    const script = staticGit()
    const { face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.push(TAB, true, SIGNAL)
    face.pull(TAB, SIGNAL)
    await flush()
    expect(script.mocks.push).toHaveBeenCalledWith(SESSION, true, SIGNAL)
    expect(script.mocks.pull).toHaveBeenCalledWith(SESSION, SIGNAL)
  })

  it('re-reads the branch list after a checkout or a create', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.loadBranches(TAB, SIGNAL)
    await flush()
    expect(script.mocks.branches).toHaveBeenCalledTimes(1)
    face.checkout(TAB, 'main', SIGNAL)
    face.createBranch(TAB, 'feature', 'main', SIGNAL)
    await flush()
    expect(script.mocks.checkout).toHaveBeenCalledWith(SESSION, 'main', SIGNAL)
    expect(script.mocks.createBranch).toHaveBeenCalledWith(SESSION, 'feature', 'main', SIGNAL)
    expect(script.mocks.branches).toHaveBeenCalledTimes(3)
    expect(bucketOf(instance)?.branches).toEqual({ kind: 'ready', branches: [], truncated: false })
  })

  it('skips the branch re-read when the mutation itself failed', async () => {
    const script = staticGit({ checkout: { ok: false, error: REJECTED } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.checkout(TAB, 'main', SIGNAL)
    await flush()
    expect(script.mocks.branches).not.toHaveBeenCalled()
    expect(bucketOf(instance)?.failure).toBe(REJECTED)
  })

  it('records why a branch read could not answer', async () => {
    const script = staticGit({ branches: { ok: false, error: REJECTED } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.loadBranches(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.branches).toEqual({ kind: 'failed', failure: REJECTED })
  })
})

describe('gitFace commit', () => {
  it('commits the trimmed message and empties the box', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    instance.actions.commitDraft(TAB, '  fix the panel  ')
    face.commit(TAB, '  fix the panel  ', false, SIGNAL)
    await flush()
    expect(script.mocks.commit).toHaveBeenCalledWith(SESSION, 'fix the panel', SIGNAL)
    expect(script.mocks.stage).not.toHaveBeenCalled()
    expect(bucketOf(instance)?.commitDraft).toBe('')
    expect(script.mocks.status).toHaveBeenCalledTimes(2)
  })

  it('stages everything first when asked, refusing to commit if staging failed', async () => {
    const refused = staticGit({ stage: { ok: false, error: REJECTED } })
    const { instance, face } = mount(refused)
    face.start(TAB, SIGNAL)
    await flush()
    face.commit(TAB, 'ship it', true, SIGNAL)
    await flush()
    expect(refused.mocks.stage).toHaveBeenCalledWith(SESSION, '', SIGNAL)
    expect(refused.mocks.commit).not.toHaveBeenCalled()
    expect(instance.getSnapshot().byTab[TAB]).toMatchObject({ busy: false, failure: REJECTED })

    const staged = staticGit()
    const second = mount(staged)
    second.face.start(TAB, SIGNAL)
    await flush()
    second.face.commit(TAB, 'ship it', true, SIGNAL)
    await flush()
    expect(staged.mocks.stage).toHaveBeenCalledWith(SESSION, '', SIGNAL)
    expect(staged.mocks.commit).toHaveBeenCalledWith(SESSION, 'ship it', SIGNAL)
  })

  it('asks nothing for a message that trims to nothing', () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    return flush().then(() => {
      face.commit(TAB, '   ', false, SIGNAL)
      expect(script.mocks.commit).not.toHaveBeenCalled()
      expect(bucketOf(instance)?.busy).toBe(false)
    })
  })

  it('keeps the draft when the commit is refused', async () => {
    const script = staticGit({ commit: { ok: false, error: REJECTED } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    instance.actions.commitDraft(TAB, 'blocked')
    face.commit(TAB, 'blocked', false, SIGNAL)
    await flush()
    expect(bucketOf(instance)).toMatchObject({ commitDraft: 'blocked', failure: REJECTED })
  })
})

describe('gitFace diff', () => {
  it('opens one read and settles its text', async () => {
    const script = staticGit({ diff: { ok: true, value: '+hello\n world' } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.openDiff(TAB, 'src/a.ts', true, SIGNAL)
    expect(bucketOf(instance)?.diff).toEqual({ path: 'src/a.ts', staged: true, phase: { kind: 'loading' } })
    await flush()
    expect(script.mocks.diff).toHaveBeenCalledWith(SESSION, 'src/a.ts', true, SIGNAL)
    expect(bucketOf(instance)?.diff).toEqual({
      path: 'src/a.ts', staged: true, phase: { kind: 'ready', text: '+hello\n world' },
    })
  })

  it('lets the latest read of the diff win, whichever settles first', async () => {
    const script = gatedGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    face.openDiff(TAB, 'src/a.ts', false, SIGNAL)
    face.openDiff(TAB, 'src/a.ts', true, SIGNAL)
    script.q.diff[1]?.resolve({ ok: true, value: 'staged text' })
    await flush()
    expect(bucketOf(instance)?.diff?.phase).toEqual({ kind: 'ready', text: 'staged text' })
    script.q.diff[0]?.resolve({ ok: false, error: REJECTED })
    await flush()
    expect(bucketOf(instance)?.diff?.phase).toEqual({ kind: 'ready', text: 'staged text' })
  })
})

describe('gitFace GitHub section', () => {
  it('probes the login, then reads the list under the filter it was given', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    expect(bucketOf(instance)?.gh).toEqual({ kind: 'on' })
    face.ghAuth(TAB, 'closed', SIGNAL)
    expect(bucketOf(instance)?.gh).toEqual({ kind: 'authLoading' })
    await flush()
    expect(bucketOf(instance)?.gh).toEqual({ kind: 'ready' })
    expect(script.mocks.ghListPrs).toHaveBeenCalledWith(SESSION, 'closed', SIGNAL)
    expect(bucketOf(instance)?.prs).toEqual({ kind: 'ready', state: 'closed', prs: [] })
  })

  it('words the sign-in hint with gh\'s own message, and again for a transport failure', async () => {
    const out = new RemoteError('workspace-git/command-failed', 'exit 1', {
      command: 'gh auth status', code: 1, stderr: 'not logged in',
    })
    const script = staticGit({ ghAuthStatus: { ok: true, value: { authenticated: false, message: 'not logged in' } } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.ghAuth(TAB, 'open', SIGNAL)
    await flush()
    expect(bucketOf(instance)?.gh).toEqual({ kind: 'signedOut', message: 'not logged in' })
    expect(script.mocks.ghListPrs).not.toHaveBeenCalled()

    const unreachable = staticGit({ ghAuthStatus: { ok: false, error: out } })
    const second = mount(unreachable)
    second.face.start(TAB, SIGNAL)
    await flush()
    second.face.ghAuth(TAB, 'open', SIGNAL)
    await flush()
    expect(bucketOf(second.instance)?.gh).toEqual({ kind: 'signedOut', message: out.message })
  })

  it('reads the list under one filter and reports its failure', async () => {
    const refused = staticGit({ ghListPrs: { ok: false, error: REJECTED } })
    const { instance, face } = mount(refused)
    face.start(TAB, SIGNAL)
    await flush()
    face.ghList(TAB, 'all', SIGNAL)
    await flush()
    expect(bucketOf(instance)?.prs).toEqual({ kind: 'failed', state: 'all', failure: REJECTED })

    const script = staticGit()
    const second = mount(script)
    second.face.start(TAB, SIGNAL)
    await flush()
    second.face.ghList(TAB, 'open', SIGNAL)
    await flush()
    expect(script.mocks.ghListPrs).toHaveBeenCalledWith(SESSION, 'open', SIGNAL)
  })

  it('lets the latest list read win, whichever settles first', async () => {
    const script = gatedGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    face.ghList(TAB, 'open', SIGNAL)
    face.ghList(TAB, 'closed', SIGNAL)
    script.q.ghListPrs[1]?.resolve({ ok: true, value: [] })
    await flush()
    expect(bucketOf(instance)?.prs).toEqual({ kind: 'ready', state: 'closed', prs: [] })
    script.q.ghListPrs[0]?.resolve({ ok: false, error: REJECTED })
    await flush()
    expect(bucketOf(instance)?.prs).toEqual({ kind: 'ready', state: 'closed', prs: [] })
  })

  it('stands the created notice up, re-reading the list under its filter', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.ghCreatePr(TAB, 'Fix', 'The fix', 'main', 'open', SIGNAL)
    await flush()
    expect(script.mocks.ghCreatePr).toHaveBeenCalledWith(SESSION, 'Fix', 'The fix', 'main', SIGNAL)
    expect(bucketOf(instance)).toMatchObject({ busy: false, created: { number: 7, url: 'https://example.com/pull/7' } })
    expect(script.mocks.ghListPrs).toHaveBeenCalledWith(SESSION, 'open', SIGNAL)
  })

  it('reports a refused pull request beside the notice that never stood', async () => {
    const refused = new RemoteError('workspace-git/bad-pr-title', 'long', { field: 'title', length: 501 })
    const script = staticGit({ ghCreatePr: { ok: false, error: refused } })
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.ghCreatePr(TAB, 'A very long title', 'Body', '', 'all', SIGNAL)
    await flush()
    expect(bucketOf(instance)).toMatchObject({ busy: false, failure: refused, created: undefined })
  })

  it('merges one way and re-reads the list under its filter', async () => {
    const script = staticGit()
    const { instance, face } = mount(script)
    face.start(TAB, SIGNAL)
    await flush()
    face.ghMergePr(TAB, 7, 'squash', 'open', SIGNAL)
    await flush()
    expect(script.mocks.ghMergePr).toHaveBeenCalledWith(SESSION, 7, 'squash', SIGNAL)
    expect(bucketOf(instance)?.busy).toBe(false)
    expect(script.mocks.ghListPrs).toHaveBeenCalledWith(SESSION, 'open', SIGNAL)
  })
})

describe('gitFace aborts', () => {
  /** A face whose tab aborts while the remote still holds its answer. */
  function abortedMount() {
    const script = gatedGit()
    const mounted = mount(script)
    const controller = new AbortController()
    return { script, ...mounted, controller }
  }

  it('drops a mutation that resolves after the tab aborted', async () => {
    const { script, instance, face, controller } = abortedMount()
    face.start(TAB, controller.signal)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    script.q.status[0]?.resolve({ ok: true, value: CLEAN_STATUS })
    await flush()
    expect(bucketOf(instance)?.repo).toEqual({ kind: 'ready', status: CLEAN_STATUS })
    face.pull(TAB, controller.signal)
    controller.abort()
    script.q.pull[0]?.resolve({ ok: false, error: REJECTED })
    await flush()
    // The abort already forgot the bucket; the late failure never touched it.
    expect(bucketOf(instance)).toBeUndefined()
  })

  it('drops the gh availability probe that resolves after the tab aborted', async () => {
    const { script, instance, face, controller } = abortedMount()
    face.start(TAB, controller.signal)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    script.q.status[0]?.resolve({ ok: true, value: CLEAN_STATUS })
    controller.abort()
    script.q.ghAvailable[0]?.resolve({ ok: true, value: true })
    await flush()
    expect(bucketOf(instance)).toBeUndefined()
  })

  it('drops a failed stage whose commit never flew, once aborted', async () => {
    const { script, face, controller } = abortedMount()
    face.start(TAB, controller.signal)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    face.commit(TAB, 'fix', true, controller.signal)
    controller.abort()
    script.q.stage[0]?.resolve({ ok: false, error: REJECTED })
    await flush()
    expect(script.q.commit).toHaveLength(0)
  })

  it('drops a settled commit whose follow-up read never flew, once aborted', async () => {
    const { script, face, controller } = abortedMount()
    face.start(TAB, controller.signal)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    face.commit(TAB, 'fix', true, controller.signal)
    script.q.stage[0]?.resolve({ ok: true, value: undefined })
    // Let the flow reach the commit call before the tab ends.
    await flush()
    controller.abort()
    script.q.commit[0]?.resolve({ ok: true, value: undefined })
    await flush()
    expect(script.q.status).toHaveLength(1)
  })

  it('drops the gh login probe that resolves after the tab aborted', async () => {
    const { script, face, controller } = abortedMount()
    face.start(TAB, controller.signal)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    face.ghAuth(TAB, 'open', controller.signal)
    controller.abort()
    script.q.ghAuthStatus[0]?.resolve({ ok: false, error: REJECTED })
    await flush()
    expect(script.q.ghListPrs).toHaveLength(0)
  })

  it('drops a created pull request whose re-read never flew, once aborted', async () => {
    const { script, face, controller } = abortedMount()
    face.start(TAB, controller.signal)
    script.q.isRepo[0]?.resolve({ ok: true, value: true })
    await flush()
    face.ghCreatePr(TAB, 'Fix', 'The fix', 'main', 'open', controller.signal)
    controller.abort()
    script.q.ghCreatePr[0]?.resolve({ ok: true, value: { number: 7, url: 'https://example.com/pull/7' } })
    await flush()
    expect(script.q.ghListPrs).toHaveLength(0)
  })
})
