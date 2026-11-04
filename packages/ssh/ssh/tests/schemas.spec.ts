import { describe, expect, it } from 'vitest'
import { hunkSchema, moveOptionsSchema } from '../src/schemas.ts'

describe('remote JSON schemas', () => {
  it('keeps an admitted hunk context and omits an absent one', () => {
    const bare = { lineNumber: 3, oldLines: ['old'], newLines: ['patched'], isEndOfFile: false }
    expect(hunkSchema.parse(bare)).toEqual(bare)
    // The declared context is optional; when present it survives the transform.
    expect(hunkSchema.parse({ ...bare, context: 'function f() {' }))
      .toEqual({ ...bare, context: 'function f() {' })
    expect(moveOptionsSchema.parse({})).toEqual({})
  })
})
