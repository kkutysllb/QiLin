// @vitest-environment jsdom
/**
 * Stage one, as the registry sees it: the type is a page that claims no
 * address, sits in the builtin band, holds one tab per surface, and offers the
 * guide page one entry at order 20 that opens its kind.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { Context } from '@qilin-agent/kylin'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { SidebarRightTabRegistry } from '@qilin-agent/client-ui-sidebar-right/src/client/tab-registry.ts'
import { GIT_ID, GIT_KIND, gitDefinition } from '../src/client/definition.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

afterEach(cleanup)

describe('gitDefinition', () => {
  it('registers under its kind and id and claims no address', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(gitDefinition(t))
    expect(registry.get(GIT_KIND)?.id).toBe(GIT_ID)
    expect(registry.candidates('qilin-resource://file/session/s-1/notes.md')).toEqual([])
  })

  it('offers the guide page one entry at order 20 that opens the git kind', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(gitDefinition(t))
    const [entry, ...rest] = registry.guide()
    expect(rest).toEqual([])
    expect(entry?.order).toBe(20)
    expect(entry?.kind).toBe(GIT_KIND)
    expect(entry?.title()).toBe(zh['guide.title'])
    expect(entry?.description?.()).toBe(zh['guide.description'])
    if (entry?.icon === undefined) throw new Error('expected the guide icon')
    const icon = render(createElement(entry.icon, { size: 26 }))
    expect(icon.container.querySelector('svg')?.getAttribute('width')).toBe('26')
  })

  it('sits in the builtin band, holds one tab per surface, and names itself from the dictionary', () => {
    const definition = gitDefinition(t)
    expect(definition.priority).toBe('builtin')
    expect(definition.patterns).toBeUndefined()
    expect(definition.single).toBe(true)
    expect(definition.label!()).toBe(zh['type.label'])
    expect(definition.title('')).toBe(zh['type.label'])
    if (definition.icon === undefined) throw new Error('expected the chip icon')
    const chip = render(createElement(definition.icon, { size: 14 }))
    expect(chip.container.querySelector('svg')?.getAttribute('width')).toBe('14')
  })
})
