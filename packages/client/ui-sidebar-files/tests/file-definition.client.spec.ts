/**
 * The `file` type as the registry sees it: the builtin band claim over the
 * session file addresses the gate accepts, one tab per address, and the
 * switch-row label from the dictionary.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@qilin/kylin'
import { makeTranslate } from '@qilin/client-test-runtime'
import { SidebarRightTabRegistry } from '@qilin/client-ui-sidebar-right/src/client/tab-registry.ts'
import { sessionFileAddress } from '@qilin/util-workspace-path'
import { FILE_ID, FILE_KIND, fileDefinition } from '../src/client/file-definition.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

describe('fileDefinition', () => {
  it('registers under its kind and id in the builtin band', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(fileDefinition(t))
    expect(registry.get(FILE_KIND)?.id).toBe(FILE_ID)
    expect(registry.get(FILE_KIND)?.priority).toBe('builtin')
  })

  it('claims session addresses with editable extensions, over the fallback band', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(fileDefinition(t))
    const address = sessionFileAddress('s-1', 'src/app/a.ts')
    const claim = registry.claim(address)
    expect(claim).toEqual({ kind: FILE_KIND, contentId: address, title: 'a.ts' })
    expect(registry.claim(sessionFileAddress('s-1', 'docs/my notes.md')).title).toBe('my notes.md')
  })

  it('vetoes absolute addresses, unknown extensions, and non-file addresses', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(fileDefinition(t))
    expect(registry.candidates('qilin-resource://file/absolute/home/a.ts')).toEqual([])
    expect(registry.candidates(sessionFileAddress('s-1', 'logo.png'))).toEqual([])
    expect(registry.candidates(sessionFileAddress('s-1', 'Makefile'))).toEqual([])
    expect(registry.candidates('sidebar://guide')).toEqual([])
  })

  it('holds one tab per address: no single, no guide entry', () => {
    const definition = fileDefinition(t)
    expect(definition.single).toBeUndefined()
    expect(definition.guide).toBeUndefined()
    expect(definition.icon).toBeUndefined()
    expect(definition.patterns).toEqual(['qilin-resource://file/**'])
  })

  it('labels the type from the dictionary', () => {
    expect(fileDefinition(t).label!()).toBe(zh['file.type.label'])
  })
})
