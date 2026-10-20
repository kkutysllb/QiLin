/** Product manifest validation, path resolution, and profile seeding. */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  desktopProductDefaults,
  loadDesktopProduct,
  parseDesktopProduct,
  productDataDirectory,
  productHarnessHome,
  productPresetsDirectory,
} from '../src/product.ts'
import { discoverProductPlugins, seedProductProfile } from '../src/product-runtime.ts'
import { SCHEME, SCHEME_ARGUMENT, desktopScheme } from '../src/ipc.ts'
import { parseAccountSessionCookie } from '../src/product-auth.ts'

const roots: string[] = []

function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), 'desktop-product-'))
  roots.push(directory)
  return directory
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const manifest = {
  schemaVersion: 1,
  name: 'KStock',
  appId: 'com.example.kstock',
  scheme: 'kstock',
  homeRelative: '.kstock',
  harnessHomeRelative: '.kstock/qilin-home',
  devHarnessHomeRelative: '.kstock-dev/qilin-home-dev',
  profile: 'kstock',
  profileBundles: ['@qilin-agent/base', '@qilin-agent/web-app', '@kstock/web'],
  pluginRoot: 'engine/plugins',
  presetsRoot: 'engine/presets',
  runtime: { tar: 'runtime.tar.gz', devTar: 'staging/runtime.tar.gz' },
  auth: { mode: 'boot-secret', secretEnv: 'KSTOCK_DESKTOP_BOOT_SECRET', endpoint: '/api/auth/desktop-session', header: 'x-kstock-boot-secret' },
  office: false,
  update: { provider: 'generic', url: 'https://example.test/releases/' },
}

describe('product manifest', () => {
  it('falls back to the built-in QiLin product when none is configured', () => {
    const loaded = loadDesktopProduct({ packaged: true, appPath: '/app/resources/app.asar', resourcesPath: '/app/resources' })
    expect(loaded.product.name).toBe('QiLin Desktop')
    expect(loaded.product.profile).toBe('desktop')
    expect(loaded.product.auth.mode).toBe('welcome')
    expect(loaded.source).toBeUndefined()
  })

  it('reads and validates a product manifest', () => {
    const root = temporary()
    const path = join(root, 'product.json')
    writeFileSync(path, JSON.stringify(manifest))
    const loaded = loadDesktopProduct({ packaged: false, appPath: root, resourcesPath: root, manifestPath: path, root })
    expect(loaded.product).toEqual(manifest)
    expect(loaded.root).toBe(root)
    expect(loaded.source).toBe(path)
  })

  it('rejects a manifest with an unknown schema version', () => {
    expect(() => parseDesktopProduct({ ...manifest, schemaVersion: 2 })).toThrow(/schemaVersion/u)
  })

  it('rejects an auth mode the shell cannot run', () => {
    expect(() => parseDesktopProduct({ ...manifest, auth: { ...manifest.auth, mode: 'oauth' } })).toThrow(/auth.mode/u)
  })

  it('keeps relative paths against the packaged resources directory', () => {
    const product = parseDesktopProduct(manifest)
    expect(productDataDirectory(product, true, '/Users/example')).toBe('/Users/example/.kstock')
    expect(productDataDirectory(product, false, '/Users/example')).toBe('/Users/example/.kstock-dev')
    expect(productHarnessHome(product, true, '/Users/example')).toBe('/Users/example/.kstock/qilin-home')
    expect(productHarnessHome(product, false, '/Users/example')).toBe('/Users/example/.kstock-dev/qilin-home-dev')
    expect(productPresetsDirectory(product, '/srv/resources')).toBe('/srv/resources/engine/presets')
  })

  it('keeps the built-in product defaults free of a preset override', () => {
    expect(desktopProductDefaults().presetsRoot).toBeUndefined()
  })
})

describe('product profile seeding', () => {
  it('links every discovered plugin and writes the product bundle layers', () => {
    const root = temporary()
    const pluginsRoot = join(root, 'engine', 'plugins')
    for (const [directory, name] of [['web', '@kstock/web'], ['quant', '@kstock/quant']] as const) {
      mkdirSync(join(pluginsRoot, directory), { recursive: true })
      writeFileSync(join(pluginsRoot, directory, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
    }
    const plugins = discoverProductPlugins(pluginsRoot)
    expect(plugins.map(plugin => plugin.name)).toEqual(['@kstock/quant', '@kstock/web'])
    const profile = join(root, 'profile')
    seedProductProfile(profile, parseDesktopProduct(manifest), plugins)
    const written = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      qilin: { profile: { bundles: string[] } }
    }
    expect(written.dependencies['@kstock/web']).toBe(`link:${join(pluginsRoot, 'web')}`)
    expect(written.qilin.profile.bundles).toEqual(manifest.profileBundles)
  })

  it('preserves user bundle layers when the product layers already exist', () => {
    const root = temporary()
    const profile = join(root, 'profile')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'profile', private: true, dependencies: {},
      qilin: { profile: { bundles: [...manifest.profileBundles, 'user-layer'] } },
    }))
    seedProductProfile(profile, parseDesktopProduct(manifest), [])
    const written = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as { qilin: { profile: { bundles: string[] } } }
    expect(written.qilin.profile.bundles).toEqual([...manifest.profileBundles, 'user-layer'])
  })
})

describe('account session parsing', () => {
  it('reads a session cookie and its expiry', () => {
    const parsed = parseAccountSessionCookie('qilin-session-abc=value.sig; Path=/; Max-Age=60; Expires=Wed, 21 Oct 2026 07:28:00 GMT')
    expect(parsed?.name).toBe('qilin-session-abc')
    expect(parsed?.value).toBe('value.sig')
    expect(parsed?.expiresAt).toBeTypeOf('number')
  })

  it('rejects a header without a name or value', () => {
    expect(parseAccountSessionCookie(null)).toBeUndefined()
    expect(parseAccountSessionCookie('novalue')).toBeUndefined()
    expect(parseAccountSessionCookie('=value')).toBeUndefined()
  })
})

describe('application scheme', () => {
  it('reads the product scheme from the preload argument', () => {
    expect(desktopScheme([`${SCHEME_ARGUMENT}kstock`])).toBe('kstock')
  })

  it('falls back to the environment for main-process helpers', () => {
    const previous = process.env.QILIN_DESKTOP_SCHEME
    process.env.QILIN_DESKTOP_SCHEME = 'kstock'
    try { expect(desktopScheme([])).toBe('kstock') }
    finally {
      if (previous === undefined) delete process.env.QILIN_DESKTOP_SCHEME
      else process.env.QILIN_DESKTOP_SCHEME = previous
    }
  })

  it('rejects a malformed scheme and keeps the engine default', () => {
    expect(desktopScheme([`${SCHEME_ARGUMENT}Bad Scheme`])).toBe(SCHEME)
  })

  it('never hardcodes the engine application origin in shell origin checks', () => {
    // The application document runs under the product scheme; every check that
    // compares its origin must derive the scheme instead of naming qilin-app.
    for (const file of ['main.ts', 'keyboard.ts']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
      expect(source, file).not.toContain("'qilin-app://app")
    }
    // The forwarder keeps the engine origin only as its default parameter; every caller
    // passes the product origin explicitly.
    expect(readFileSync(new URL('../src/web-document.ts', import.meta.url), 'utf8')).toContain('applicationOrigin')
  })
})
