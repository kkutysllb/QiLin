/** The CLI and manager share package reconciliation, path anchoring and diagnostics. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { expect, it, onTestFinished, vi } from 'vitest'
import { getQilinRuntimeVersion, initProfile, readProfileManifest } from '@qilin/app-boot'
import { anchorPathSpec, runPluginCommand, runProfilePnpm, viewProfilePackage } from '../src/operations.ts'

const command = vi.hoisted(() => ({ run: vi.fn<(...args: unknown[]) => ReturnType<typeof result>>() }))
vi.mock('execa', () => ({ execa: (...args: unknown[]) => command.run(...args) }))

/** Whether the bounded wait for a recorded run returns at once; the wait itself is measured in run-tree.spec.ts. */
const treeWait = vi.hoisted(() => ({ skip: false }))
vi.mock('../src/run-tree.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/run-tree.ts')>()
  return {
    ...actual,
    awaitTreeGone: async (...args: Parameters<typeof actual.awaitTreeGone>) => {
      if (!treeWait.skip) await actual.awaitTreeGone(...args)
    },
  }
})

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'manager-pnpm-'))
  onTestFinished(() => { command.run.mockReset(); treeWait.skip = false; rmSync(home, { recursive: true, force: true }) })
  const dir = join(home, 'profiles', 'test')
  const installAnchor = join(home, 'package.json')
  writeFileSync(installAnchor, '{}\n')
  initProfile(dir, [])
  return { home, dir, context: { home, profile: 'test', installAnchor, cwd: home } }
}

function result(
  exitCode: number | undefined, output: string, mutate: () => void = () => {},
  details: { code?: string; shortMessage?: string } = {},
) {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const done = Promise.resolve().then(() => {
    mutate()
    stdout.end(output)
    stderr.end()
    return { exitCode, failed: exitCode !== 0, stdout: output, stderr: '', ...details }
  })
  return Object.assign(done, { stdout, stderr })
}

function install(dir: string, name: string) {
  const path = join(dir, 'node_modules', name)
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'package.json'), JSON.stringify({ name, version: '1', qilin: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(path, 'cordis.patch.yml'), '[]\n')
  const manifest = readProfileManifest('test', dir)
  manifest.dependencies = { ...manifest.dependencies, [name]: '1' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
}

it('anchors relative package specs without rewriting registry specs', () => {
  expect(anchorPathSpec('.', '/workspace')).toBe(resolve('/workspace'))
  expect(anchorPathSpec('file:../plugin', '/workspace/project')).toBe(`file:${resolve('/workspace/plugin')}`)
  expect(anchorPathSpec('package@1', '/workspace')).toBe('package@1')
})

it('activates newly installed bundles and leaves retained disabled dependencies disabled', async () => {
  const { dir, context } = fixture()
  const state = pnpm()
  install(dir, 'disabled')
  state.mutate = (target) => { install(target, 'new-bundle') }
  expect(await runPluginCommand(context, ['add', 'new-bundle'], { execution: 'service', outputBytes: 100 })).toMatchObject({ exitCode: 0 })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['new-bundle'])
  state.mutate = () => {}
  state.output = 'updated'
  await runPluginCommand(context, ['update'], { execution: 'service', outputBytes: 100 })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['new-bundle'])
})

it('can install without activation and bounds output while retaining the complete log', async () => {
  const { dir, context } = fixture()
  command.run.mockImplementationOnce(() => result(0, '0123456789', () =>{  install(dir, 'extra') }))
  const outcome = await runProfilePnpm(context, ['add', './extra'], { execution: 'service', outputBytes: 4, activateNewBundles: false })
  expect(outcome).toMatchObject({ exitCode: 0, output: '6789', truncated: true })
  expect(readFileSync(outcome.logPath, 'utf8')).toBe('0123456789')
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual([])
  expect(command.run.mock.calls[0]?.[1]).toEqual(['add', join(context.cwd, 'extra')])
})

it.each([runPluginCommand, runProfilePnpm])('installs into the supplied application profile directory with %s', async (run) => {
  const { home, dir: namedDir, context } = fixture()
  const dir = join(home, 'application', 'profile')
  const state = pnpm()
  initProfile(dir, [])
  state.mutate = (target) => { install(target, 'extra') }
  const outcome = await run({ ...context, dir }, ['add', 'extra'], { execution: 'service', outputBytes: 100 })
  expect(outcome.exitCode).toBe(0)
  expect(command.run.mock.calls[0]?.[2]).toMatchObject({ cwd: dir })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['extra'])
  expect(readProfileManifest('test', namedDir).dependencies).not.toHaveProperty('extra')
  expect(readProfileManifest('test', namedDir).qilin?.profile?.bundles).toEqual([])
})

it('retains partial package-manager changes after failure without activating them', async () => {
  const { dir, context } = fixture()
  const state = pnpm()
  state.exitCode = 1
  state.output = 'installation failed'
  state.mutate = (target) => { install(target, 'partial') }
  expect(await runProfilePnpm(context, ['add', 'partial'], { execution: 'service', outputBytes: 100 })).toMatchObject({ exitCode: 1 })
  expect(readProfileManifest('test', dir).dependencies).toEqual({ partial: '1' })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual([])
})


it('initializes missing profiles under the same lock and reports initialization', async () => {
  const { home, context } = fixture()
  const messages: string[] = []
  command.run.mockImplementation(() => result(0, ''))
  for (const profile of ['custom', 'web']) {
    await runPluginCommand({ ...context, profile }, ['root'], {
      execution: 'service', outputBytes: 100, lockWaitMs: 1000, onOutput: (text) => { messages.push(text) },
    })
    expect(readProfileManifest('test', join(home, 'profiles', profile)).qilin?.profile?.bundles).toContain('@qilin/base')
  }
  expect(messages.filter(text => text.includes('initialized profile'))).toHaveLength(2)
})

/** The record an operation leaves for the pnpm run it started. */
function runRecord(dir: string): string {
  return join(dir, '.plugin-manager', 'run.json')
}

/** A fake run that publishes `pid`, keeps its pipes open, and reads the profile's run record before ending. */
function observingResult(dir: string, pid: number, ms = 100) {
  const observed: { record: string | undefined } = { record: undefined }
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  return Object.assign(
    new Promise<{ exitCode: number; failed: boolean; stdout: string; stderr: string }>((resolve) => {
      setTimeout(() => {
        observed.record = existsSync(runRecord(dir)) ? readFileSync(runRecord(dir), 'utf8') : undefined
        stdout.end('')
        stderr.end()
        resolve({ exitCode: 0, failed: false, stdout: '', stderr: '' })
      }, ms)
    }),
    { stdout, stderr, pid, observed },
  )
}

it.each([8192, 30])('refuses to run while a run recorded by an exited operation is still active (output bound %i)', async (outputBytes) => {
  const { dir, context } = fixture()
  treeWait.skip = true
  mkdirSync(join(dir, '.plugin-manager'), { recursive: true })
  const record = JSON.stringify({ pid: process.pid, grouped: false })
  writeFileSync(runRecord(dir), record)
  const messages: string[] = []
  const outcome = await runProfilePnpm(context, ['add', './extra'], {
    execution: 'service', outputBytes, onOutput: (text) => { messages.push(text) },
  })
  const diagnostic = readFileSync(outcome.logPath, 'utf8')
  expect(diagnostic).toContain(`process ${String(process.pid)}, started by an earlier package operation whose own process ended, is still running`)
  expect(diagnostic).toContain(`delete ${runRecord(dir)}`)
  expect(messages.join('')).toBe(diagnostic)
  expect(outcome).toMatchObject({ exitCode: 1, truncated: diagnostic.length > outputBytes })
  expect(outcome.output).toBe(diagnostic.slice(-outputBytes))
  expect(command.run).not.toHaveBeenCalled()
  expect(readFileSync(runRecord(dir), 'utf8')).toBe(record)
})

it('removes the record of a recorded run that stopped and runs', async () => {
  const { dir, context } = fixture()
  const state = pnpm()
  state.output = 'installed'
  const exited = 2_000_000_000
  const kill = process.kill.bind(process)
  vi.spyOn(process, 'kill').mockImplementation(((target: number, signal?: NodeJS.Signals | number) => {
    if (target === exited) throw Object.assign(new Error('ESRCH: injected'), { code: 'ESRCH' })
    return kill(target, signal)
  }) as typeof process.kill)
  onTestFinished(() => { vi.restoreAllMocks() })
  mkdirSync(join(dir, '.plugin-manager'), { recursive: true })
  writeFileSync(runRecord(dir), JSON.stringify({ pid: exited, grouped: false }))
  const outcome = await runProfilePnpm(context, ['add', './extra'], { execution: 'service', outputBytes: 8192 })
  expect(outcome.exitCode).toBe(0)
  expect(command.run).toHaveBeenCalledOnce()
  expect(existsSync(runRecord(dir))).toBe(false)
})

it.each(['not json', 'null', '{"pid":0,"grouped":false}', '{"pid":12,"grouped":"no"}'])(
  'refuses to run beside a run record that names no run: %s', async (record) => {
    const { dir, context } = fixture()
    mkdirSync(join(dir, '.plugin-manager'), { recursive: true })
    writeFileSync(runRecord(dir), record)
    const outcome = await runProfilePnpm(context, ['add', './extra'], { execution: 'service', outputBytes: 8192 })
    expect(outcome).toMatchObject({ exitCode: 1 })
    expect(outcome.output).toBe(`qilin: ${runRecord(dir)} does not name a package run; delete it once no earlier package operation is still running in this profile\n`)
    expect(command.run).not.toHaveBeenCalled()
  },
)

it.each(['cli', 'service'] as const)('records a %s run while it runs and removes the record once it ends', async (execution) => {
  const { dir, context } = fixture()
  const child = observingResult(dir, 4242)
  command.run.mockImplementationOnce(() => child as unknown as ReturnType<typeof result>)
  const outcome = await runProfilePnpm(context, ['list'], { execution, outputBytes: 8192 })
  expect(outcome.exitCode).toBe(0)
  expect(JSON.parse(child.observed.record ?? 'null')).toEqual({
    pid: 4242, grouped: execution === 'service' && process.platform !== 'win32',
  })
  expect(existsSync(runRecord(dir))).toBe(false)
})

it('records the install that repairs a refused installation', async () => {
  const { dir, context } = fixture()
  const state = pnpm()
  state.mutate = (target) => { installGuarded(target, 'incompatible') }
  const base = command.run.getMockImplementation() as (...call: unknown[]) => ReturnType<typeof result>
  const repair = observingResult(dir, 4343)
  command.run.mockImplementation((...call: unknown[]) => {
    const argv = call[1] as readonly string[]
    return argv.includes('--config.lockfile=false') ? repair as unknown as ReturnType<typeof result> : base(...call)
  })
  const outcome = await runProfilePnpm(context, ['add', 'incompatible'], { execution: 'service', outputBytes: 8192 })
  expect(outcome.exitCode).toBe(1)
  expect(JSON.parse(repair.observed.record ?? 'null')).toEqual({ pid: 4343, grouped: false })
  expect(existsSync(runRecord(dir))).toBe(false)
})

it('retains built-in layers, removes deleted dependencies and warns about plain packages', async () => {
  const { context, dir } = fixture()
  install(dir, 'removed')
  const manifest = readProfileManifest('test', dir)
  manifest.qilin = { profile: { bundles: ['builtin', 'removed'] } }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  const messages: string[] = []
  command.run.mockImplementationOnce(() => result(0, '', () => {
    install(dir, 'plain')
    writeFileSync(join(dir, 'node_modules', 'plain', 'package.json'), '{"name":"plain"}')
    const after = readProfileManifest('test', dir)
    delete after.dependencies?.removed
    writeFileSync(join(dir, 'package.json'), JSON.stringify(after))
  }))
  await runPluginCommand(context, ['remove', 'removed'], { execution: 'service', outputBytes: 100, onOutput: (text) => { messages.push(text) } })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['builtin'])
  expect(messages.join('')).toContain('plain dependency')
})

it('preserves a package-manager selected new bundle without adding it twice', async () => {
  const { context, dir } = fixture()
  const state = pnpm()
  writeFileSync(join(dir, 'package.json'), '{}')
  state.mutate = (target) => {
    install(target, 'new')
    const manifest = readProfileManifest('test', target)
    manifest.qilin = { profile: { bundles: ['new'] } }
    writeFileSync(join(target, 'package.json'), JSON.stringify(manifest))
  }
  await runProfilePnpm(context, ['add', 'new'], { execution: 'service', outputBytes: 100 })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['new'])
})

it.each([
  { code: 'ENOENT', shortMessage: 'pnpm not found', expected: 127 },
  { code: 'EACCES', shortMessage: undefined, expected: 1 },
])('reports launch failures with a complete log: $code', async ({ code, shortMessage, expected }) => {
  const { context } = fixture()
  command.run.mockImplementationOnce(() => result(undefined, '', () => {}, { code, ...shortMessage === undefined ? {} : { shortMessage } }))
  const outcome = await runProfilePnpm(context, ['root'], { execution: 'service', outputBytes: 4, signal: new AbortController().signal })
  expect(outcome.exitCode).toBe(expected)
  expect(outcome.truncated).toBe(true)
  expect(readFileSync(outcome.logPath, 'utf8')).toBe(shortMessage ?? 'pnpm failed')
})

it('cancels and settles package output when the output consumer fails', async () => {
  const { context } = fixture()
  let cancellation: AbortSignal | undefined
  command.run.mockImplementationOnce((_name, _args, options) => {
    cancellation = (options as { cancelSignal: AbortSignal }).cancelSignal
    const child = result(0, 'text')
    child.stdout.setEncoding('utf8')
    return child
  })
  await expect(runProfilePnpm(context, ['root'], {
    execution: 'service', outputBytes: 100, onOutput() { throw new Error('output destination closed') },
  })).rejects.toThrow('output destination closed')
  expect(cancellation?.aborted).toBe(true)
})

it('preserves an unexpected subprocess rejection after both streams settle', async () => {
  const { context } = fixture()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  stdout.end()
  stderr.end()
  command.run.mockImplementationOnce(() => Object.assign(Promise.reject(new Error('subprocess failed')), { stdout, stderr }))
  await expect(runProfilePnpm(context, ['root'], { execution: 'service', outputBytes: 100 })).rejects.toThrow('subprocess failed')
})


it('handles manifests without dependency or bundle selections', async () => {
  const { context, dir } = fixture()
  command.run.mockImplementationOnce(() => result(0, '', () => { writeFileSync(join(dir, 'package.json'), '{}') }))
  expect(await runProfilePnpm(context, ['root'], { execution: 'service', outputBytes: 100 })).toMatchObject({ exitCode: 0 })
})

it.each(['cli', 'service'] as const)('uses the %s environment and interaction policy', async (execution) => {
  const { context } = fixture()
  const names = ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'DEEPSEEK_API_KEY']
  const originals = names.map(name => process.env[name])
  onTestFinished(() => {
    names.forEach((name, index) => {
      const original = originals[index]
      if (original === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = original
    })
  })
  for (const name of names) process.env[name] = 'fixture-credential'
  command.run.mockImplementationOnce(() => result(0, ''))
  await runPluginCommand(context, ['approve-builds'], { execution, outputBytes: 100 })
  const options = command.run.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv; stdin: string; stdout: string; stderr: string }
  for (const name of names) expect(options.env[name]).toBe(execution === 'cli' ? 'fixture-credential' : undefined)
  expect(options.stdin).toBe(execution === 'cli' ? 'inherit' : 'ignore')
  expect(options.stdout).toBe(execution === 'cli' ? 'inherit' : 'pipe')
  expect(options.stderr).toBe(execution === 'cli' ? 'inherit' : 'pipe')
})

it('settles inherited CLI descriptors without requiring captured streams', async () => {
  const { context } = fixture()
  command.run.mockImplementationOnce(() => Object.assign(
    Promise.resolve({ exitCode: 0, failed: false }), { stdout: null, stderr: null },
  ) as unknown as ReturnType<typeof result>)
  expect(await runPluginCommand(context, ['approve-builds'], { execution: 'cli', outputBytes: 100 })).toMatchObject({ exitCode: 0, output: '' })
})

it('asks the registry through pnpm view in the profile directory and reports how the lookup ended', async () => {
  const { dir } = fixture()
  const answer = (value: object) => command.run.mockResolvedValueOnce(value as never)
  answer({ exitCode: 0, stdout: '{"name":"x"}', stderr: '', timedOut: false, isCanceled: false })
  expect(await viewProfilePackage(dir, 'x@^1', { timeoutMs: 5 })).toEqual({ exitCode: 0, stdout: '{"name":"x"}', stderr: '', timedOut: false })
  expect(command.run).toHaveBeenLastCalledWith('pnpm', ['view', 'x@^1', 'name', 'version', 'description', 'qilin', '--json'], expect.objectContaining({
    cwd: dir, timeout: 5, reject: false, stdin: 'ignore',
  }))
  expect((command.run.mock.lastCall as unknown[])[2]).not.toHaveProperty('cancelSignal')
  const signal = AbortSignal.abort()
  answer({ exitCode: undefined, stdout: '', stderr: '', timedOut: true, isCanceled: false })
  expect(await viewProfilePackage(dir, 'x', { timeoutMs: 5, signal })).toEqual({ exitCode: null, stdout: '', stderr: '', timedOut: true })
  expect((command.run.mock.lastCall as unknown[])[2]).toMatchObject({ cancelSignal: signal })
  answer({ exitCode: undefined, stdout: '', stderr: '', timedOut: false, isCanceled: true })
  expect(await viewProfilePackage(dir, 'x', { command: 'node', timeoutMs: 5 })).toEqual({ exitCode: null, stdout: '', stderr: '', timedOut: false })
  expect((command.run.mock.lastCall as unknown[])[0]).toBe('node')
  answer({ exitCode: undefined, stdout: '', stderr: '', timedOut: false, isCanceled: false, code: 'ENOENT', shortMessage: 'spawn pnpm ENOENT' })
  const missing = await viewProfilePackage(dir, 'x', { timeoutMs: 5 })
  expect(missing).toMatchObject({ exitCode: null, timedOut: false })
  expect(missing.cause).toMatchObject({ message: 'spawn pnpm ENOENT', code: 'ENOENT' })
})

it('uses application-owned executable arguments and environment for package operations and inspection', async () => {
  const { dir, context } = fixture()
  const runtime = { command: '/app/electron', args: ['--expose-internals', '/app/pnpm.mjs'], env: { ELECTRON_RUN_AS_NODE: '1', PATH: '/app/bin' } }
  command.run.mockImplementationOnce(() => result(0, ''))
  await runProfilePnpm(context, ['add', './extra'], { ...runtime, execution: 'service', outputBytes: 100, activateNewBundles: false })
  expect(command.run).toHaveBeenLastCalledWith(runtime.command, [...runtime.args, 'add', resolve(context.cwd, 'extra')],
    expect.objectContaining({ env: expect.objectContaining(runtime.env) as unknown }))
  command.run.mockResolvedValueOnce(Object.assign({ exitCode: 0, failed: false }, { stdout: '{}', stderr: '', timedOut: false }))
  await viewProfilePackage(dir, 'example', { ...runtime, timeoutMs: 1000 })
  expect(command.run).toHaveBeenLastCalledWith(runtime.command,
    [...runtime.args, 'view', 'example', 'name', 'version', 'description', 'qilin', '--json'],
    expect.objectContaining({ env: expect.objectContaining(runtime.env) as unknown }))
})

/** What each kind of pnpm invocation changes in the profile and what it answers. */
interface FakePnpm {
  /** What the run changes in the profile. */
  mutate: (dir: string) => void
  exitCode: number
  output: string
  /** Exit code of the `install` run that repairs a post-install refusal. */
  repairExit: number
  /** What the pre-install `pnpm view` lookup answers for one spec; `{}` declares no peers. */
  view: (spec: string) => { exitCode: number; stdout: string }
  /** The specs the pre-install check asked `pnpm view` about, in order. */
  views: string[]
}

/**
 * Route the three pnpm invocations one package operation can make: the registry
 * lookup that only reads, the frozen install that repairs a post-install
 * refusal, and the run itself, which applies this fixture's mutation.
 * @returns the recorded expectations for the run under test.
 */
function pnpm(): FakePnpm {
  const state: FakePnpm = {
    mutate: () => {},
    exitCode: 0,
    output: '',
    repairExit: 0,
    view: () => ({ exitCode: 0, stdout: '{}' }),
    views: [],
  }
  command.run.mockImplementation((...call: unknown[]) => {
    const argv = call[1] as readonly string[]
    const runDir = (call[2] as { cwd: string }).cwd
    const lookup = argv.indexOf('view')
    if (lookup !== -1) {
      const spec = argv[lookup + 1] as string
      state.views.push(spec)
      const answer = state.view(spec)
      return result(answer.exitCode, answer.stdout)
    }
    if (argv.includes('--frozen-lockfile') || argv.includes('--config.lockfile=false')) return result(state.repairExit, '')
    return result(state.exitCode, state.output, () => { state.mutate(runDir) })
  })
  return state
}

/** A path spec whose manifest declares a peer requirement the running runtime does not satisfy. */
function writePathSpec(home: string, peer: string): void {
  mkdirSync(join(home, 'plugin'), { recursive: true })
  writeFileSync(join(home, 'plugin', 'package.json'), JSON.stringify({
    name: 'plugin', version: '1.0.0', peerDependencies: { '@qilin/app-boot': peer },
  }))
}

/** The installed manifest of a dependency whose peers the running runtime rejects. */
function installGuarded(dir: string, dependency: string, name = dependency, version = '1.0.0', peer = '>=999.0.0'): void {
  install(dir, dependency)
  writeFileSync(join(dir, 'node_modules', dependency, 'package.json'), JSON.stringify({
    name, version, peerDependencies: { '@qilin/app-boot': peer }, qilin: { bundle: { patch: './cordis.patch.yml' } },
  }))
}

it.each([
  { form: 'a relative path', spec: () => './plugin' },
  { form: 'a file: path', spec: () => 'file:./plugin' },
  { form: 'a link: path', spec: () => 'link:./plugin' },
  { form: 'an absolute path', spec: (home: string) => join(home, 'plugin') },
])('rejects an incompatible $form before pnpm runs and leaves both profile files alone', async ({ spec }) => {
  const { home, dir, context } = fixture()
  writePathSpec(home, '999.0.0')
  const manifestBefore = readFileSync(join(dir, 'package.json'), 'utf8')
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'original-lock\n')
  const messages: string[] = []
  const outcome = await runProfilePnpm(context, ['add', spec(home)], {
    execution: 'service', outputBytes: 8192, onOutput: (text) => { messages.push(text) },
  })
  expect(outcome.exitCode).toBe(1)
  expect(outcome.incompatible).toEqual([
    { name: 'plugin', version: '1.0.0', runtimeVersion: getQilinRuntimeVersion(), peers: { '@qilin/app-boot': '999.0.0' } },
  ])
  expect(outcome.output).toContain('installation rejected')
  expect(outcome.output).toContain('plugin@1.0.0')
  expect(outcome.output).toContain('nothing was installed')
  expect(messages.join('')).toContain('nothing was installed')
  expect(readFileSync(outcome.logPath, 'utf8')).toContain('plugin@1.0.0')
  // The spec was read from disk, so no pnpm invocation exists to install anything.
  expect(command.run).not.toHaveBeenCalled()
  expect(existsSync(join(dir, 'node_modules'))).toBe(false)
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifestBefore)
  expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe('original-lock\n')
})

it.each(['plugin@1.0.0', '@scope/plugin@1.0.0'])('rejects the registry spec %s the pre-install lookup denies, without installing it', async (spec) => {
  const { dir, context } = fixture()
  const state = pnpm()
  const name = spec.slice(0, spec.lastIndexOf('@'))
  state.view = () => ({ exitCode: 0, stdout: JSON.stringify({ name, version: '1.0.0', peerDependencies: { '@qilin/app-boot': '999.0.0' } }) })
  const manifestBefore = readFileSync(join(dir, 'package.json'), 'utf8')
  const outcome = await runProfilePnpm(context, ['add', spec], { execution: 'service', outputBytes: 8192 })
  expect(outcome).toMatchObject({ exitCode: 1 })
  expect(outcome.output).toContain('installation rejected')
  expect(outcome.output).toContain(`${name}@1.0.0`)
  expect(outcome.output).toContain('nothing was installed')
  // The lookup is the only pnpm invocation: the refused spec never reached an install.
  expect(state.views).toEqual([spec])
  expect(command.run).toHaveBeenCalledTimes(1)
  expect(command.run.mock.calls[0]?.[1] as readonly string[]).toContain('view')
  expect(existsSync(join(dir, 'node_modules'))).toBe(false)
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifestBefore)
})

it('reads the last match when the registry lookup answers with several versions', async () => {
  const { context } = fixture()
  const state = pnpm()
  state.view = () => ({
    exitCode: 0,
    stdout: JSON.stringify([
      { name: 'plugin', version: '1.0.0' },
      { name: 'plugin', version: '2.0.0', peerDependencies: { '@qilin/app-boot': '999.0.0' } },
    ]),
  })
  const outcome = await runProfilePnpm(context, ['add', 'plugin@^2', '--registry=https://registry.example'], {
    execution: 'service', outputBytes: 8192, lookupTimeoutMs: 5_000,
  })
  expect(outcome).toMatchObject({ exitCode: 1 })
  expect(outcome.output).toContain('plugin@2.0.0')
  expect(state.views).toEqual(['plugin@^2'])
  // The lookup asks the registry the installation would use.
  expect(command.run.mock.calls[0]?.[1] as readonly string[]).toContain('--registry=https://registry.example')
  expect(command.run).toHaveBeenCalledTimes(1)
})

it('makes no registry lookup for commands that are not installs', async () => {
  const { context } = fixture()
  const state = pnpm()
  for (const args of [['update'], ['remove', 'plugin'], ['list'], ['approve-builds']]) {
    expect(await runProfilePnpm(context, args, { execution: 'service', outputBytes: 8192 })).toMatchObject({ exitCode: 0 })
  }
  expect(state.views).toEqual([])
  expect(command.run).toHaveBeenCalledTimes(4)
})

it('installs an incompatible path spec the profile exempts', async () => {
  const { home, dir, context } = fixture()
  const state = pnpm()
  writePathSpec(home, '999.0.0')
  writeFileSync(join(dir, 'compatibility.json'), JSON.stringify({ 'plugin@1.0.0': [getQilinRuntimeVersion()] }) + '\n')
  state.mutate = (target) => {
    install(target, 'plugin')
    writeFileSync(join(target, 'node_modules', 'plugin', 'package.json'), JSON.stringify({
      name: 'plugin', version: '1.0.0', peerDependencies: { '@qilin/app-boot': '999.0.0' },
      qilin: { bundle: { patch: './cordis.patch.yml' } },
    }))
  }
  expect(await runProfilePnpm(context, ['add', './plugin'], { execution: 'service', outputBytes: 8192 }))
    .toMatchObject({ exitCode: 0 })
  // A path spec never needs a registry lookup, and the exemption covers the installed manifest too.
  expect(state.views).toEqual([])
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['plugin'])
})

it.each([true, false])('rejects an incompatible installed manifest before activation (%s) and restores exact profile files', async (activateNewBundles) => {
  const { dir, context } = fixture()
  const state = pnpm()
  const manifestBefore = readFileSync(join(dir, 'package.json'), 'utf8')
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'original-lock\n')
  const messages: string[] = []
  // Only the installed manifest carries the incompatibility, so it is the post-install check that refuses it.
  state.mutate = (target) => {
    installGuarded(target, 'incompatible')
    writeFileSync(join(target, 'pnpm-lock.yaml'), 'changed-lock\n')
  }
  const outcome = await runProfilePnpm(context, ['add', 'incompatible'], {
    execution: 'service', outputBytes: 8192, activateNewBundles, onOutput: (text) => { messages.push(text) },
  })
  expect(outcome.exitCode).toBe(1)
  expect(outcome.incompatible).toMatchObject([{ name: 'incompatible', version: '1.0.0', peers: { '@qilin/app-boot': '>=999.0.0' } }])
  expect(outcome.output).toContain('incompatible@1.0.0')
  expect(outcome.output).toContain('installation rejected')
  expect(readFileSync(outcome.logPath, 'utf8')).toContain('incompatible@1.0.0')
  expect(messages.join('')).toContain('installation rejected')
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifestBefore)
  expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe('original-lock\n')
  // The refused run replaced the installed tree, so the restored lockfile is reinstalled.
  expect(command.run).toHaveBeenLastCalledWith(expect.anything(), ['install', '--frozen-lockfile'], expect.anything())
  expect(outcome.output).toContain('and node_modules')
})

it('repairs a profile that had no lockfile without creating one', async () => {
  const { dir, context } = fixture()
  const state = pnpm()
  state.mutate = (target) => {
    installGuarded(target, 'incompatible')
    writeFileSync(join(target, 'pnpm-lock.yaml'), 'created-lock\n')
  }
  const outcome = await runProfilePnpm(context, ['add', 'incompatible'], { execution: 'service', outputBytes: 8192 })
  expect(outcome.exitCode).toBe(1)
  expect(existsSync(join(dir, 'pnpm-lock.yaml'))).toBe(false)
  expect(command.run).toHaveBeenLastCalledWith(expect.anything(), ['install', '--config.lockfile=false'], expect.anything())
  expect(outcome.output).toContain('and node_modules')
})

it('reports an unrepaired node_modules when the restoring install fails', async () => {
  const { context } = fixture()
  const state = pnpm()
  state.mutate = (target) => { installGuarded(target, 'incompatible') }
  state.repairExit = 1
  const outcome = await runProfilePnpm(context, ['add', 'incompatible'], { execution: 'service', outputBytes: 8192 })
  expect(outcome).toMatchObject({ exitCode: 1 })
  expect(outcome.output).toContain('node_modules could not be reinstalled')
  expect(outcome.output).toContain("run 'qilin plugin install'")
})

it('does not fail an unrelated installation on an untouched incompatible dependency', async () => {
  const { context, dir } = fixture()
  const state = pnpm()
  installGuarded(dir, 'incompatible')
  const messages: string[] = []
  state.mutate = (target) => { install(target, 'unrelated') }
  expect(await runProfilePnpm(context, ['add', 'unrelated'], {
    execution: 'service', outputBytes: 8192, onOutput: (text) => { messages.push(text) },
  })).toMatchObject({ exitCode: 0 })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['unrelated'])
  expect(messages.join('')).toContain('startup denies it')
})

it('installs a dependency whose installed manifest declares compatible peers', async () => {
  const { dir, context } = fixture()
  const state = pnpm()
  state.mutate = (target) => {
    install(target, 'plugin')
    writeFileSync(join(target, 'node_modules', 'plugin', 'package.json'), JSON.stringify({
      name: 'plugin', version: '1.0.0', peerDependencies: { '@qilin/app-boot': '*' },
      qilin: { bundle: { patch: './cordis.patch.yml' } },
    }))
  }
  expect(await runProfilePnpm(context, ['add', 'plugin'], { execution: 'service', outputBytes: 8192 }))
    .toMatchObject({ exitCode: 0 })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['plugin'])
})
