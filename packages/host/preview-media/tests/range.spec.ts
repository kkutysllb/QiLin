import { describe, expect, it } from 'vitest'
import { parseRange } from '../src/range.ts'

describe('parseRange', () => {
  it('returns null without a header', () => {
    expect(parseRange(undefined, 100)).toBeNull()
  })

  it('parses a bounded range and clamps the end to EOF', () => {
    expect(parseRange('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 })
    expect(parseRange('bytes=500-999', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=900-2000', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('parses an open-ended range to EOF and a zero start shorthand', () => {
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('treats a suffix at or past the size as the whole file', () => {
    expect(parseRange('bytes=-1000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('honours only the first range of a multi-range set', () => {
    expect(parseRange('bytes=0-9,20-29', 1000)).toEqual({ start: 0, end: 9 })
  })

  it('marks a start at or past EOF unsatisfiable', () => {
    expect(parseRange('bytes=1000-', 1000)).toEqual({ unsatisfiable: true })
    expect(parseRange('bytes=5000-6000', 1000)).toEqual({ unsatisfiable: true })
  })

  it('ignores non-integer, negative, empty, inverted, and non-byte specs', () => {
    expect(parseRange('bytes=1.5-9', 1000)).toBeNull()
    expect(parseRange('bytes=-0', 1000)).toBeNull()
    expect(parseRange('bytes=', 1000)).toBeNull()
    expect(parseRange('bytes=9-5', 1000)).toBeNull()
    expect(parseRange('items=0-9', 1000)).toBeNull()
    expect(parseRange('bytes=a-b', 1000)).toBeNull()
    expect(parseRange('bytes10', 1000)).toBeNull()
  })

  it('matches the unit case-insensitively and trims surrounding space', () => {
    expect(parseRange('  BYTES=0-9 ', 1000)).toEqual({ start: 0, end: 9 })
  })

  it('degrades to a whole-file 200 on an empty file', () => {
    expect(parseRange('bytes=0-', 0)).toEqual({ unsatisfiable: true })
    expect(parseRange('bytes=-5', 0)).toEqual({ unsatisfiable: true })
  })
})
