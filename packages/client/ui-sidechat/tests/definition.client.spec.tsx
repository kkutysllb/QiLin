/**
 * The sidechat tab type's registry definition and the dictionaries' pairing.
 */
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@qilin/client-test-runtime'
import { SIDECHAT_ID, SIDECHAT_KIND, sidechatDefinition } from '../src/client/definition.tsx'
import { NS, en, zh } from '../src/client/locales.ts'

describe('sidechat definition', () => {
  it('registers one single-page sidechat tab with the panel copy', () => {
    const t = makeTranslate(zh)
    const definition = sidechatDefinition(t)
    expect(definition.id).toBe(SIDECHAT_ID)
    expect(definition.kind).toBe(SIDECHAT_KIND)
    expect(definition.single).toBe(true)
    expect(definition.label?.()).toBe(zh['type.label'])
    expect(definition.title(SIDECHAT_ID)).toBe(zh['type.label'])
    expect(definition.icon).toBeDefined()
  })

  it('pairs the en dictionary with the zh key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(NS).toBe('sidebarSidechat')
  })
})
