import { describe, expect, it } from 'vitest'
import {
  bundlePatchOf,
  clientDeclarationOf,
  dshCompatModuleId,
  DSH_PLATFORM_MODULE_ALIASES,
} from '../src/index.ts'

describe('DSH platform module aliases', () => {
  it('maps every DSH-era platform name onto its QiLin seed-table key', () => {
    expect(DSH_PLATFORM_MODULE_ALIASES['@deepseek-ai/cordis']).toBe('@qilin/kylin')
    expect(DSH_PLATFORM_MODULE_ALIASES['cordis']).toBe('@qilin/kylin')
    expect(DSH_PLATFORM_MODULE_ALIASES['@deepseek-ai/dsh-client-store']).toBe('@qilin/client-store')
    expect(DSH_PLATFORM_MODULE_ALIASES['@deepseek-ai/dsh-client-ui-slots']).toBe('@qilin/client-ui-slots')
    expect(DSH_PLATFORM_MODULE_ALIASES['@deepseek-ai/dsh-client-ui-primitives']).toBe('@qilin/client-ui-primitives')
    expect(DSH_PLATFORM_MODULE_ALIASES['@deepseek-ai/dsh-client-ui-dockkit']).toBe('@qilin/client-ui-dockkit')
  })

  it('aliases every DSH platform seed word DSH itself shipped', () => {
    // The upstream DSH platform table is the compatibility contract: each of
    // its entries must have an alias here, or a bundle requiring the DSH name
    // misses the seed table at runtime.
    const dshPlatform = [
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    ]
    for (const name of dshPlatform) {
      if (name.startsWith('react')) continue
      expect(dshCompatModuleId(name)).not.toBe(name)
    }
  })
})

describe('dshCompatModuleId', () => {
  it('canonicalizes scoped DSH package names with the rename table', () => {
    expect(dshCompatModuleId('@deepseek-ai/dsh-client-locale')).toBe('@qilin/client-locale')
    expect(dshCompatModuleId('@deepseek-ai/dsh-host-webserver')).toBe('@qilin/host-webserver')
    expect(dshCompatModuleId('@deepseek-ai/dsh-client-runtime')).toBe('@qilin/client-modules')
    expect(dshCompatModuleId('@deepseek-ai/dsh-client-runtime/client')).toBe('@qilin/client-modules/client')
    expect(dshCompatModuleId('@deepseek-ai/dsh-client-ui-settings/client')).toBe('@qilin/client-ui-settings/client')
  })

  it('passes unrenamed and unknown specifiers through unchanged', () => {
    expect(dshCompatModuleId('@qilin/schemastery')).toBe('@qilin/schemastery')
    expect(dshCompatModuleId('@qilin/kylin')).toBe('@qilin/kylin')
    expect(dshCompatModuleId('react')).toBe('react')
    expect(dshCompatModuleId('some-third-party')).toBe('some-third-party')
    expect(dshCompatModuleId('')).toBe('')
  })
})

describe('bundlePatchOf', () => {
  it('reads the qilin key first and falls back to the dsh key', () => {
    expect(bundlePatchOf({ qilin: { bundle: { patch: './a.yml' } } })).toBe('./a.yml')
    expect(bundlePatchOf({ dsh: { bundle: { patch: './b.yml' } } })).toBe('./b.yml')
    const both = { qilin: { bundle: { patch: './q.yml' } }, dsh: { bundle: { patch: './d.yml' } } }
    expect(bundlePatchOf(both)).toBe('./q.yml')
  })

  it('falls through a non-string declaration and reports nothing for absent keys', () => {
    expect(bundlePatchOf({ qilin: { bundle: { patch: 7 } }, dsh: { bundle: { patch: './d.yml' } } })).toBe('./d.yml')
    expect(bundlePatchOf({ qilin: { bundle: {} } })).toBeUndefined()
    expect(bundlePatchOf({})).toBeUndefined()
    expect(bundlePatchOf(null)).toBeUndefined()
    expect(bundlePatchOf('not-an-object')).toBeUndefined()
  })
})

describe('clientDeclarationOf', () => {
  it('picks qilin.client first and names the key that supplied the value', () => {
    expect(clientDeclarationOf({ qilin: { client: { platform: 'web' } } })?.key).toBe('qilin.client')
    expect(clientDeclarationOf({ dsh: { client: { platform: 'web' } } })?.key).toBe('dsh.client')
    const picked = clientDeclarationOf({ dsh: { client: { platform: 'web' } } })
    expect(picked?.value).toEqual({ platform: 'web' })
    const both = { qilin: { client: { platform: 'web' } }, dsh: { client: { platform: 'web' } } }
    expect(clientDeclarationOf(both)?.key).toBe('qilin.client')
  })

  it('returns undefined when neither key declares a client half', () => {
    expect(clientDeclarationOf({ qilin: { bundle: { patch: './a.yml' } } })).toBeUndefined()
    expect(clientDeclarationOf({})).toBeUndefined()
    expect(clientDeclarationOf(null)).toBeUndefined()
  })
})
