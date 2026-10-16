import { describe, expect, it } from 'vitest'
import { truncateWithoutSplittingSurrogatePair } from '../src/index.ts'

describe('truncateWithoutSplittingSurrogatePair', () => {
  it('keeps text that already fits', () => {
    expect(truncateWithoutSplittingSurrogatePair('abc', 5)).toBe('abc')
    expect(truncateWithoutSplittingSurrogatePair('abc', 3)).toBe('abc')
  })
  it('caps without splitting a surrogate pair', () => {
    const text = 'ab\uD83D\uDE00cd'
    expect(truncateWithoutSplittingSurrogatePair(text, 3)).toBe('ab')
    expect(truncateWithoutSplittingSurrogatePair(text, 4)).toBe('ab\uD83D\uDE00')
  })
})
