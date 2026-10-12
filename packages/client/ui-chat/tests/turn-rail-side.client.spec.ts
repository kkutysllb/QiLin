/** CSS checks pinning the turn rail to the transcript's left edge. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sheet = readFileSync(
  join(import.meta.dirname, '../src/client/chat/TurnNavigator.module.css'),
  'utf8',
)

describe('turn rail placement', () => {
  it('hangs the frame off the left edge and grows the ticks leftward', () => {
    expect(sheet).toMatch(/\.frame\s*\{[^}]*left: 12px;/)
    expect(sheet).not.toMatch(/\.frame\s*\{[^}]*\n\s*right: 12px;/)
    expect(sheet).toMatch(/transform-origin: left center;/)
    expect(sheet).toMatch(/inset: 0 auto 0 0;/)
  })

  it('opens the hover preview into the transcript, right of the rail', () => {
    expect(sheet).toMatch(/left: calc\(100% \+ 10px\);/)
    expect(sheet).toMatch(/translateX\(-4px\)/)
    expect(sheet).not.toMatch(/right: calc\(100% \+ 10px\);/)
  })
})
