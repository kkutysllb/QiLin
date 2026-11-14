/** The private persistent-REPL entry boots the covered main on the inherited control channel. */
import { describe, expect, it, vi } from 'vitest'

const run = vi.hoisted(() => vi.fn())
const channel = { inherited: true }

vi.mock('@qilin-agent/subprocess/control', () => ({ openInheritedControlChannel: () => channel }))
vi.mock('../src/persistent-process.ts', () => ({ runPersistentMain: (...args: unknown[]) => { run(...args) } }))

describe('persistent process entry', () => {
  it('runs the persistent main on the inherited channel with the fd argument', async () => {
    vi.resetModules()
    const original = process.argv[2]
    process.argv[2] = '7'
    try {
      await import('../src/persistent-process-entry.ts')
    } finally {
      if (original === undefined) process.argv.length = 2
      else process.argv[2] = original
    }
    expect(run).toHaveBeenCalledWith(channel, 7, process)
  })
})
