import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseQilinArgs } from '../src/args.ts'

const parse = (argv: string[]) => parseQilinArgs(argv, '1.2.3')

/** Capture the process exit code while muting Commander's output. */
function exitCode(argv: string[]): number {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  try {
    parse(argv)
    throw new Error(`expected ${JSON.stringify(argv)} to exit`)
  } catch {
    return exit.mock.calls.at(-1)?.[0] as number
  } finally {
    vi.restoreAllMocks()
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('parseQilinArgs', () => {
  it('routes profile boots and shorthand, handing the rest to the app', () => {
    expect(parse(['--profile', 'tui'])).toEqual({ mode: 'profile', profile: 'tui', patches: [], args: [] })
    expect(parse(['--profile', 'tui', '--patch', 'a.yml', '--patch', 'b.yml']))
      .toEqual({ mode: 'profile', profile: 'tui', patches: ['a.yml', 'b.yml'], args: [] })
    expect(parse(['--profile', 'rescue', '--from-default-profile', 'web']))
      .toEqual({ mode: 'profile', profile: 'rescue', fromDefaultProfile: 'web', patches: [], args: [] })
    expect(parse(['web'])).toEqual({ mode: 'profile', profile: 'web', patches: [], args: [] })
    expect(parse(['web', '--patch', 'web.yml']))
      .toEqual({ mode: 'profile', profile: 'web', patches: ['web.yml'], args: [] })
  })

  it('boots the product profile when no profile is named, handing the rest to the app', () => {
    expect(parse([])).toEqual({ mode: 'profile', profile: 'qilin', patches: [], args: [] })
    expect(parse(['--port', '3081', '--no-open', '--future-app-flag']))
      .toEqual({ mode: 'profile', profile: 'qilin', patches: [], args: ['--port', '3081', '--no-open', '--future-app-flag'] })
    expect(parse(['--dump-config']))
      .toEqual({ mode: 'dump-config', profile: 'qilin', defaultOnly: false, patches: [] })
    expect(parse(['--dump-default-config']))
      .toEqual({ mode: 'dump-config', profile: 'qilin', defaultOnly: true, patches: [] })
    expect(parse(['--dump-config', '--patch', 'q.yml']))
      .toEqual({ mode: 'dump-config', profile: 'qilin', defaultOnly: false, patches: ['q.yml'] })
    // An explicit profile still wins over the product default.
    expect(parse(['--profile', 'tui'])).toEqual({ mode: 'profile', profile: 'tui', patches: [], args: [] })
  })

  it('ends the launcher flags at the first token it does not own', () => {
    // App flags, including its -h, and positionals reach the app verbatim.
    expect(parse(['--profile', 'tui', '--resume', 'abc']))
      .toEqual({ mode: 'profile', profile: 'tui', patches: [], args: ['--resume', 'abc'] })
    expect(parse(['--profile', 'web', '-h']))
      .toEqual({ mode: 'profile', profile: 'web', patches: [], args: ['-h'] })
    expect(parse(['web', '--host', '127.0.0.1', '--port', '8080', '--no-open', '--future-web-flag']))
      .toEqual({ mode: 'profile', profile: 'web', patches: [], args: ['--host', '127.0.0.1', '--port', '8080', '--no-open', '--future-web-flag'] })
    expect(parse(['--profile', 'headless', 'run', 'the', 'tests']))
      .toEqual({ mode: 'profile', profile: 'headless', patches: [], args: ['run', 'the', 'tests'] })
    // Launcher flags placed after that boundary belong to the app too.
    expect(parse(['--profile', 'tui', '--patch', 'a.yml', '--resume', 'b', '--patch', 'late.yml']))
      .toEqual({ mode: 'profile', profile: 'tui', patches: ['a.yml'], args: ['--resume', 'b', '--patch', 'late.yml'] })
    expect(parse(['--profile', 'rescue', '--resume', 'abc', '--from-default-profile', 'web']))
      .toEqual({
        mode: 'profile',
        profile: 'rescue',
        patches: [],
        args: ['--resume', 'abc', '--from-default-profile', 'web'],
      })
    expect(parse(['web', '--from-default-profile', 'web']))
      .toEqual({ mode: 'profile', profile: 'web', fromDefaultProfile: 'web', patches: [], args: [] })
  })

  it.each(['web', 'headless', 'sdk', 'sdk-minimal', 'acp', 'tui', 'custom', 'run', 'help'])('expands %s without looking up profiles', (profile) => {
    for (const args of [
      [], ['task', 'words'], ['--help'], ['-h'], ['web'],
      ['--patch', 'a.yml', '--patch', 'b.yml'],
      ['--from-default-profile', 'web', '--help'],
      ['--dump-config'], ['--dump-default-config'],
      ['--patch', 'a.yml', '--resume', 'id', '--patch', 'late.yml'],
      ['--', '--help'], ['--', '--', 'task'],
      ['plugin'], ['--', 'plugin'],
    ]) {
      expect(parse([profile, ...args])).toEqual(parse(['--profile', profile, ...args]))
    }
  })

  it('reserves leading plugin for management and forwards later command names', () => {
    expect(parse(['--profile', 'plugin'])).toMatchObject({ mode: 'profile', profile: 'plugin' })
    expect(parse(['--profile', 'x', 'plugin', 'add', 'y']))
      .toMatchObject({ mode: 'profile', profile: 'x', args: ['plugin', 'add', 'y'] })
    expect(parse(['headless', 'web'])).toMatchObject({ profile: 'headless', args: ['web'] })
    expect(parse(['--patch', 'a.yml', 'tui']))
      .toMatchObject({ profile: 'qilin', patches: ['a.yml'], args: ['tui'] })
    expect(parse(['--', 'tui'])).toMatchObject({ profile: 'qilin', args: ['tui'] })
  })

  it.each([
    [''], ['desktop'], ['Desktop'], ['DESKTOP'],
    ['custom', '--patch='], ['custom', '--from-default-profile='],
    ['custom', '--dump-config', '--dump-default-config'],
    ['custom', '--dump-default-config', '--patch', 'a.yml'],
    ['custom', '--dump-config', 'task'],
  ])('rejects invalid shorthand %j', (...argv: string[]) => {
    expect(exitCode(argv)).toBe(1)
  })

  it.each(['-V', '--version'])('prints the launcher version for shorthand %s', (flag) => {
    expect(exitCode(['custom', flag])).toBe(0)
    expect(parse(['custom', 'task', flag])).toMatchObject({ args: ['task', flag] })
  })

  it.each([
    ['web', '--profile', 'tui'],
    ['--profile', 'web', '--profile', 'tui'],
    ['--profile=web', '--profile=web'],
    ['plugin', '--profile', 'web', '--profile', 'tui', 'add', 'x'],
  ])('rejects repeated profile selection %j', (...argv: string[]) => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expect(exitCode(argv)).toBe(1)
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('select a profile only once')
  })

  it('forwards late profile options to the application', () => {
    expect(parse(['web', 'task', '--profile', 'tui']))
      .toMatchObject({ profile: 'web', args: ['task', '--profile', 'tui'] })
  })

  it('routes the plugin pnpm forwarder', () => {
    expect(parse(['plugin', '--profile', 'tui', 'add', 'turtle-ui']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['add', 'turtle-ui'] })
    expect(parse(['plugin', '--profile', 'tui', 'remove', 'turtle-ui']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['remove', 'turtle-ui'] })
    expect(parse(['plugin', '--profile', 'tui', 'why', '@qilin/kylin']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['why', '@qilin/kylin'] })
    // Unknown pnpm flags forward verbatim.
    expect(parse(['plugin', '--profile', 'tui', 'add', '--save-dev', 'x']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['add', '--save-dev', 'x'] })
  })

  it('defaults the plugin command to the product profile', () => {
    expect(parse(['plugin', 'add', 'turtle-ui']))
      .toEqual({ mode: 'plugin', profile: 'qilin', args: ['add', 'turtle-ui'] })
    expect(parse(['plugin', 'list'])).toEqual({ mode: 'plugin', profile: 'qilin', args: ['list'] })
    expect(parse(['plugin', 'doctor', 'dsh-super-ppts']))
      .toEqual({ mode: 'plugin', profile: 'qilin', args: ['doctor', 'dsh-super-ppts'] })
  })

  it('routes profile and web config dumps', () => {
    expect(parse(['--profile', 'web', '--dump-config']))
      .toEqual({ mode: 'dump-config', profile: 'web', defaultOnly: false, patches: [] })
    expect(parse(['--profile', 'web', '--dump-default-config']))
      .toEqual({ mode: 'dump-config', profile: 'web', defaultOnly: true, patches: [] })
    expect(parse(['--profile', 'rescue', '--from-default-profile', 'web', '--dump-config']))
      .toEqual({
        mode: 'dump-config',
        profile: 'rescue',
        fromDefaultProfile: 'web',
        defaultOnly: false,
        patches: [],
      })
    expect(parse(['--profile', 'tui', '--dump-config', '--patch', 'x.yml']))
      .toEqual({ mode: 'dump-config', profile: 'tui', defaultOnly: false, patches: ['x.yml'] })
    expect(parse(['web', '--dump-config']))
      .toEqual({ mode: 'dump-config', profile: 'web', defaultOnly: false, patches: [] })
    expect(parse(['web', '--dump-default-config']))
      .toEqual({ mode: 'dump-config', profile: 'web', defaultOnly: true, patches: [] })
  })

  it('forwards flags the launcher no longer owns to the booted app', () => {
    expect(parse([])).toMatchObject({ mode: 'profile', profile: 'qilin', args: [] })
    expect(parse(['qilin'])).toMatchObject({ mode: 'profile', profile: 'qilin', args: [] })
    expect(parse(['task'])).toMatchObject({ mode: 'profile', profile: 'task', args: [] })
    expect(parse(['--bogus'])).toMatchObject({ profile: 'qilin', args: ['--bogus'] })
    expect(parse(['--config', 'c.yml'])).toMatchObject({ profile: 'qilin', args: ['--config', 'c.yml'] })
  })

  it('rejects incomplete and contradictory inputs', () => {
    expect(exitCode(['--profile', ''])).toBe(1)
    expect(exitCode(['--profile', 'x', '--from-default-profile='])).toBe(1)
    expect(exitCode(['--profile', 'x', '--from-default-profile'])).toBe(1)
    expect(exitCode(['--profile', 'x', '--patch='])).toBe(1)
    expect(exitCode(['--profile', 'x', '--dump-config', '--dump-default-config'])).toBe(1)
    expect(exitCode(['--profile', 'x', '--dump-default-config', '--patch', 'p.yml'])).toBe(1)
    expect(exitCode(['--profile', 'x', '--dump-config', 'task'])).toBe(1)
    expect(exitCode(['web', '--dump-config', '--dump-default-config'])).toBe(1)
    expect(exitCode(['web', '--dump-default-config', '--patch', 'w.yml'])).toBe(1)
    expect(exitCode(['web', '--patch='])).toBe(1)
    // A dump never runs app command-line providers, so it cannot show what
    // those flags would decide; printing a tree that differs from the same
    // invocation's boot would mislead.
    expect(exitCode(['web', '--dump-config', '--port', '8080'])).toBe(1)
    expect(exitCode(['--profile', 'web', '--dump-config', '-h'])).toBe(1)
    expect(exitCode(['plugin', '--profile', 'tui'])).toBe(1) // nothing to forward
    expect(exitCode(['plugin', '--profile', ''])).toBe(1)
    expect(exitCode(['plugin', 'list', 'extra'])).toBe(1)
    expect(exitCode(['plugin', 'doctor'])).toBe(1) // doctor needs one target
    expect(exitCode(['plugin', 'doctor', 'a', 'b'])).toBe(1)
    expect(exitCode(['--profile', 'desktop'])).toBe(1)
    expect(exitCode(['--profile', 'Desktop'])).toBe(1)
    expect(exitCode(['--profile', 'DESKTOP'])).toBe(1)
    expect(exitCode(['--profile', 'desktop', '--dump-config'])).toBe(1)
    expect(exitCode(['plugin', '--profile', 'desktop', 'add', 'x'])).toBe(1)
    expect(exitCode(['plugin', '--profile', 'Desktop', 'add', 'x'])).toBe(1)
  })

  it('keeps its own help for an invocation with no app to hand it to', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    expect(exitCode(['--help'])).toBe(0)
    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).not.toContain('help [command]')
    expect(exitCode(['-h'])).toBe(0)
    expect(exitCode(['--version'])).toBe(0)
  })
})
