import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_QILIN_HOME_DISPLAY,
  QILIN_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultQilinHome,
  qilinHomeDisplay,
  qilinHomePath,
  expandHomePath,
  resolveQilinHome,
} from '@qilin/home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('qilin path helpers', () => {
  it('owns the shared default QILIN home directory name', () => {
    expect(QILIN_HOME_DIR_NAME).toBe('.qilin')
    expect(DEFAULT_QILIN_HOME_DISPLAY).toBe('~/.qilin')
    expect(defaultQilinHome()).toBe(join(homedir(), '.qilin'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.qilin')).toBe(join(homedir(), '.qilin'))
    expect(expandHomePath('~\\.qilin')).toBe(join(homedir(), '.qilin'))
    expect(expandHomePath('/tmp/.qilin')).toBe('/tmp/.qilin')
    expect(expandHomePath('~other/.qilin')).toBe('~other/.qilin')
  })

  it('resolves explicit path before QILIN_HOME and the default', () => {
    const envHome = join(homedir(), 'env-qilin')

    expect(resolveQilinHome('/tmp/explicit-qilin', { QILIN_HOME: '~/env-qilin' })).toBe(resolve('/tmp/explicit-qilin'))
    expect(resolveQilinHome(undefined, { QILIN_HOME: '~/env-qilin' })).toBe(envHome)
    expect(resolveQilinHome(undefined, {})).toBe(defaultQilinHome())
  })

  it('treats an empty or whitespace-only QILIN_HOME as unset', () => {
    expect(resolveQilinHome(undefined, { QILIN_HOME: '' })).toBe(defaultQilinHome())
    expect(resolveQilinHome(undefined, { QILIN_HOME: '   ' })).toBe(defaultQilinHome())
  })

  it('joins child segments onto the resolved QILIN_HOME', () => {
    vi.stubEnv('QILIN_HOME', '~/env-qilin')
    expect(qilinHomePath()).toBe(join(homedir(), 'env-qilin'))
    expect(qilinHomePath('storages', 'cache')).toBe(join(homedir(), 'env-qilin', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(qilinHomeDisplay(resolve(defaultQilinHome()))).toBe('~/.qilin')
    expect(qilinHomeDisplay('/some/other/root')).toBe('$QILIN_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qilin-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
