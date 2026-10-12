/**
 * Pins the public build environment a client bundle inlines: a caller that
 * resolved the values (the complete build, the dev-web watcher) is passed
 * through, while a package-local build samples the repository identity so its
 * artifact still reports the build it came from.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientBundle } from '../packages/client/tsdown.client.ts'
import { clientBuildEnvironmentDefines } from './client-build-environment.ts'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The define table of the preset's browser config for one representative package. */
function bundleDefines(): Record<string, string> {
  const config = clientBundle('@qilin-agent/client-test', ['lib/types/index.js'])({
    env: { QILIN_BUILD_FACE: 'client' },
  }).find(candidate => candidate.platform === 'browser')
  if (config === undefined) throw new Error('client config missing')
  const define = (config as { define?: Record<string, string> }).define
  if (define === undefined) throw new Error('client config carries no define table')
  return define
}

afterEach(() => { vi.unstubAllEnvs() })

describe('client bundle build environment', () => {
  it('samples the repository identity when the caller resolves no version', () => {
    vi.stubEnv('QILIN_CLIENT_VERSION', undefined)
    vi.stubEnv('QILIN_CLIENT_COMMIT_HASH', undefined)
    vi.stubEnv('QILIN_CLIENT_GIT_DIRTY', undefined)
    const manifest: unknown = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8'))
    const version = (manifest as { version: string }).version

    const defines = bundleDefines()

    // An absent value would inline as the empty-process.env fallback and leave
    // the artifact with no build identity at all.
    expect(defines['process.env.QILIN_CLIENT_VERSION']).toBe(JSON.stringify(version))
    expect(defines['process.env']).toBe('{}')
  })

  it('passes a caller-resolved environment through unchanged', () => {
    vi.stubEnv('QILIN_CLIENT_VERSION', '1.2.3')
    vi.stubEnv('QILIN_CLIENT_COMMIT_HASH', 'abcdef0')
    vi.stubEnv('QILIN_CLIENT_GIT_DIRTY', undefined)

    const expected = clientBuildEnvironmentDefines(process.env)
    const defines = bundleDefines()

    // The QILIN_CLIENT_* substitutions are exactly the caller's; the preset adds
    // only its own NODE_ENV and import.meta keys beside them.
    const publicKeys = Object.keys(defines).filter(name => name.startsWith('process.env.QILIN_CLIENT_'))
    expect(publicKeys.sort()).toEqual(Object.keys(expected).filter(name => name !== 'process.env').sort())
    for (const [name, value] of Object.entries(expected)) expect(defines[name]).toBe(value)
  })
})
