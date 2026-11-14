import { describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import type { SessionEvent } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import { projectionReader } from '../src/projection-reader.ts'
import { plainSession, shellTurn } from './harness.ts'
import { callPaths, forgeTurnFilesProjection, patchPaths, shellPaths, within } from '../src/turn-files.ts'
import type { ForgeTurnFilesState } from '../src/turn-files.ts'

const CWD = '/work/repo'

function event(type: string, data: unknown): SessionEvent {
  return { type, data, seq: 1, time: 0 } as unknown as SessionEvent
}

const START: ForgeTurnFilesState = { turn: null, paths: [], cwd: CWD, pending: {} }

function fold(events: readonly SessionEvent[], from: ForgeTurnFilesState = START): ForgeTurnFilesState {
  return events.reduce((state, event) => forgeTurnFilesProjection.apply(state, event), from)
}

function call(callId: string, name: string, args: Record<string, unknown>): SessionEvent {
  return event('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })
}

function result(callId: string, isError = false): SessionEvent {
  return event('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: callId, isError } })
}

describe('patchPaths', () => {
  it('reads apply-patch headers for updates, additions, and deletions', () => {
    const patch = ['*** Begin Patch', '*** Update File: src/a.ts', '*** Add File: src/b.ts', '*** Delete File: src/c.ts', '*** End Patch'].join('\n')
    expect(patchPaths(patch)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  })

  it('reads a rename from a unified diff, naming both sides', () => {
    const diff = ['diff --git a/lib/old.ts b/src/new.ts', '--- a/lib/old.ts', '+++ b/src/new.ts', '@@ -1 +1 @@'].join('\n')
    expect(patchPaths(diff)).toEqual(['lib/old.ts', 'src/new.ts', 'src/new.ts', 'lib/old.ts'].filter((value, index, all) => all.indexOf(value) === index))
  })
})

describe('shellPaths', () => {
  it('reads redirection targets and tee arguments', () => {
    expect(shellPaths('echo hi > out.txt')).toEqual(['out.txt'])
    expect(shellPaths('echo hi >> logs/run.log')).toEqual(['logs/run.log'])
    expect(shellPaths('echo hi | tee -a report.md')).toEqual(['report.md'])
  })

  it('reads the arguments of writing commands', () => {
    expect(shellPaths('rm -f build/old.js')).toEqual(['build/old.js'])
    expect(shellPaths('cp src/a.ts src/b.ts')).toEqual(['src/a.ts', 'src/b.ts'])
    expect(shellPaths('sed -i s/a/b/ src/c.ts')).toEqual(['src/c.ts'])
    expect(shellPaths('git restore -- src/d.ts')).toEqual(['src/d.ts'])
  })

  it('drops tokens that need expansion and non-writing programs', () => {
    expect(shellPaths('rm -rf $DIR/*')).toEqual([])
    expect(shellPaths('cat notes.md > $OUT')).toEqual([])
    expect(shellPaths('ls -la src')).toEqual([])
    expect(shellPaths('sed s/a/b/ src/c.ts')).toEqual([])
  })
})

describe('callPaths', () => {
  it('reads write, move, patch, and shell arguments', () => {
    expect(callPaths('write', JSON.stringify({ path: 'src/a.ts', content: 'x' }))).toEqual(['src/a.ts'])
    expect(callPaths('edit', JSON.stringify({ file_path: 'src/b.ts' }))).toEqual(['src/b.ts'])
    expect(callPaths('move', JSON.stringify({ from: 'src/old.ts', to: 'src/new.ts' }))).toEqual(['src/old.ts', 'src/new.ts'])
    expect(callPaths('apply_patch', JSON.stringify({ patch: '*** Update File: src/c.ts' }))).toEqual(['src/c.ts'])
    expect(callPaths('bash', JSON.stringify({ command: 'echo x > out.txt' }))).toEqual(['out.txt'])
  })
})

describe('forgeTurnFiles over a live Session', () => {
  it('folds a real shell turn into the paths its commands wrote', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    const states = projectionReader<ForgeTurnFilesState>(ctx, 'forgeTurnFiles', ctx.sessionProjections.register(forgeTurnFilesProjection))
    const session = plainSession('/work/repo')
    try {
      shellTurn(session, 1, [
        { callId: 'c1', command: 'rm -f build/old.js', output: '' },
        { callId: 'c2', command: 'echo done | tee report.md', output: 'done' },
      ])

      const state = states.stateOf(session)

      expect(state?.turn).toBe(1)
      expect(state?.paths).toEqual(['/work/repo/build/old.js', '/work/repo/report.md'])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

describe('forgeTurnFiles projection', () => {
  it('commits the files of the last turn, keeping successful calls only', () => {
    const state = fold([
      event('turn/start', { turn: 1 }),
      call('c1', 'write', { path: 'src/a.ts' }),
      call('c2', 'write', { path: 'src/failed.ts' }),
      call('c3', 'bash', { command: 'echo x > src/shell.txt' }),
      result('c1'),
      result('c2', true),
      result('c3'),
      event('turn/end', { turn: 1, reason: 'completed' }),
    ])
    expect(state.turn).toBe(1)
    expect(state.paths).toEqual(['/work/repo/src/a.ts', '/work/repo/src/shell.txt'])
    expect(state.pending).toEqual({})
  })

  it('resolves relative paths against the turn directory and drops paths outside it', () => {
    const state = fold([
      event('working-directory/change', { cwd: CWD }),
      call('c1', 'write', { path: '../outside.ts' }),
      call('c2', 'write', { path: '/tmp/absolute.ts' }),
      call('c3', 'write', { path: 'inside.ts' }),
      result('c1'),
      result('c2'),
      result('c3'),
    ])
    expect(state.paths).toEqual(['/work/repo/inside.ts'])
  })

  it('clears the set when the next turn starts and before any turn ends reports none', () => {
    const ended = fold([
      call('c1', 'write', { path: 'a.ts' }),
      result('c1'),
      event('turn/end', { turn: 1, reason: 'completed' }),
    ])
    expect(ended.paths).toEqual(['/work/repo/a.ts'])
    const next = fold([event('turn/start', { turn: 2 })], ended)
    expect(next.paths).toEqual([])
    expect(next.turn).toBe(1)
    expect(within('/work/repo', '/work/repo')).toBe(true)
    expect(within('/work/repo', '/work/repository/x')).toBe(false)
  })
})
