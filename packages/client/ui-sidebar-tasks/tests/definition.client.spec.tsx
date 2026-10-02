// @vitest-environment jsdom
/**
 * Stage one: what the `tasks` tab type is. The definition's own words are the
 * pinned surface — identity, single-page behavior, labels, and the guide
 * entry — read through the namespace's translate.
 */
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@qilin/client-test-runtime'
import { TASKS_ID, TASKS_KIND, tasksDefinition } from '../src/client/definition.tsx'
import { zh } from '../src/client/locales.ts'

describe('tasksDefinition', () => {
  it('declares the builtin single-page type under its id and kind', () => {
    const definition = tasksDefinition(makeTranslate(zh))
    expect(definition.id).toBe(TASKS_ID)
    expect(definition.kind).toBe(TASKS_KIND)
    expect(definition.priority).toBe('builtin')
    expect(definition.single).toBe(true)
    expect(typeof definition.icon).toBe('function')
  })

  it('labels the tab and its tab title from the dictionary', () => {
    const definition = tasksDefinition(makeTranslate(zh))
    expect(definition.label?.()).toBe(zh['type.label'])
    expect(definition.title(TASKS_ID)).toBe(zh['type.label'])
  })

  it('offers the guide entry', () => {
    const definition = tasksDefinition(makeTranslate(zh))
    expect(definition.guide?.map(entry => [entry.id, entry.order, entry.title(), entry.description?.()])).toEqual([
      ['tasks', 40, zh['guide.title'], zh['guide.description']],
    ])
  })
})
