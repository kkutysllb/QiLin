// @vitest-environment jsdom
/**
 * The tab-type switches as one browser stores them.
 *
 * Only the switched-off ids are kept, so a type shipped later arrives on; a
 * browser that refuses storage leaves every switch at its default and loses
 * them on the next load, which no other part of the page can observe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDisabledTabs, writeDisabledTabs } from '../src/client/prefs.ts'

/** The one key this package owns in browser storage. */
const DISABLED_KEY = 'qilin.sidebarRight.disabledTabs'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('the stored tab-type switches', () => {
  it('answers with nothing switched off before this browser was asked once', () => {
    expect(readDisabledTabs()).toEqual([])
  })

  it('reads back the ids a write stored, under this package\'s own key', () => {
    writeDisabledTabs(['pkg/files', 'pkg/text'])
    expect(readDisabledTabs()).toEqual(['pkg/files', 'pkg/text'])
    expect(JSON.parse(localStorage.getItem(DISABLED_KEY) ?? 'null')).toEqual(['pkg/files', 'pkg/text'])
  })

  it('round-trips an empty set as nothing switched off', () => {
    writeDisabledTabs([])
    expect(readDisabledTabs()).toEqual([])
    expect(localStorage.getItem(DISABLED_KEY)).toBe('[]')
  })

  it.each([
    ['malformed JSON', '{'],
    ['a bare string', '"pkg/files"'],
    ['a number', '7'],
    ['null', 'null'],
    ['an object keyed by id', '{"pkg/files":true}'],
  ])('leaves every type on when the stored value is %s', (_label, stored) => {
    localStorage.setItem(DISABLED_KEY, stored)
    expect(readDisabledTabs()).toEqual([])
  })

  it('keeps the string ids of a mixed array and drops every other element', () => {
    localStorage.setItem(DISABLED_KEY, JSON.stringify(['pkg/files', 3, null, { id: 'pkg/text' }, 'pkg/text']))
    expect(readDisabledTabs()).toEqual(['pkg/files', 'pkg/text'])
  })

  it('leaves the switches at their defaults when storage refuses to read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage disabled') })
    expect(() => readDisabledTabs()).not.toThrow()
    expect(readDisabledTabs()).toEqual([])
  })

  it('keeps the switches working for this page when storage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded') })
    expect(() => { writeDisabledTabs(['pkg/files']) }).not.toThrow()
  })
})
