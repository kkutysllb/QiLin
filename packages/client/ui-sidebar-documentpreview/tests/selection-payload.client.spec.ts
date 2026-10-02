/**
 * The draft text one viewer selection produces: the fence header, the
 * oversize rule, and the reverse line lookup's three answers (a span, and the
 * two cases that report none).
 */
import { describe, expect, it } from 'vitest'
import {
  SELECTION_LIMIT, buildSelectionInsert, headerOf, linesOfSelection,
} from '../src/client/selection-payload.ts'

describe('selection payload — header', () => {
  it('names the path alone when the selection mapped to no lines', () => {
    expect(headerOf('work/notes.md', undefined)).toBe('work/notes.md')
  })

  it('names the one line a single-line selection covers', () => {
    expect(headerOf('work/notes.md', { start: 4, end: 4 })).toBe('work/notes.md:4')
  })

  it('names the range a multi-line selection covers', () => {
    expect(headerOf('work/notes.md', { start: 4, end: 7 })).toBe('work/notes.md:4-7')
  })
})

describe('selection payload — insert', () => {
  it('fences the selected text under the header', () => {
    expect(buildSelectionInsert('work/notes.md', { start: 2, end: 3 }, 'alpha\nbeta'))
      .toBe('```work/notes.md:2-3\nalpha\nbeta\n```')
  })

  it('fences without a line span the lookup could not resolve', () => {
    expect(buildSelectionInsert('work/notes.md', undefined, 'alpha'))
      .toBe('```work/notes.md\nalpha\n```')
  })

  it('keeps the header alone for a selection over the limit', () => {
    const oversized = 'x'.repeat(SELECTION_LIMIT + 1)
    expect(buildSelectionInsert('work/notes.md', { start: 1, end: 1 }, oversized)).toBe('work/notes.md:1')
  })

  it('keeps the selected text at exactly the limit', () => {
    const atLimit = 'x'.repeat(SELECTION_LIMIT)
    expect(buildSelectionInsert('work/notes.md', undefined, atLimit)).toContain(atLimit)
  })
})

describe('selection payload — reverse line lookup', () => {
  it('reports the line of a hit at the start of the file', () => {
    expect(linesOfSelection('alpha\nbeta\ngamma', 'alpha')).toEqual({ start: 1, end: 1 })
  })

  it('counts the lines a multi-line hit spans', () => {
    expect(linesOfSelection('one\ntwo\nthree\nfour', 'two\nthree')).toEqual({ start: 2, end: 3 })
  })

  it('strips the one trailing newline a block selection carries', () => {
    expect(linesOfSelection('one\ntwo\nthree', 'two\nthree\n')).toEqual({ start: 2, end: 3 })
  })

  it('reports nothing for a selection that is only whitespace', () => {
    expect(linesOfSelection('one\ntwo', '\n')).toBeNull()
  })

  it('reports nothing when the text is not in the source', () => {
    expect(linesOfSelection('one\ntwo', 'absent')).toBeNull()
  })

  it('reports nothing when the text occurs twice', () => {
    expect(linesOfSelection('one\ntwo\none', 'one')).toBeNull()
  })
})
