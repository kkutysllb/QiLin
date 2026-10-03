import { describe, expect, it } from 'vitest'
import { fileSizeRoundedText, fileSizeText } from '../src/file-size.ts'

describe('fileSizeText', () => {
  it('formats bytes and both sides of the KB, MB, and GB rounding thresholds', () => {
    expect(fileSizeText(312)).toBe('312B')
    expect(fileSizeText(4.25 * 1024)).toBe('4.3KB')
    expect(fileSizeText(12.5 * 1024)).toBe('13KB')
    expect(fileSizeText(1.5 * 1024 * 1024)).toBe('1.5MB')
    expect(fileSizeText(12.5 * 1024 * 1024)).toBe('13MB')
    expect(fileSizeText(2447 * 1024 * 1024)).toBe('2.4GB')
    expect(fileSizeText(12.5 * 1024 * 1024 * 1024)).toBe('13GB')
  })
})

describe('fileSizeRoundedText', () => {
  it('rounds each unit to a whole number with the unit spaced after it', () => {
    expect(fileSizeRoundedText(512)).toBe('512 B')
    expect(fileSizeRoundedText(4 * 1024)).toBe('4 KB')
    expect(fileSizeRoundedText(2.5 * 1024)).toBe('3 KB')
    expect(fileSizeRoundedText(3 * 1024 * 1024)).toBe('3 MB')
  })
})
