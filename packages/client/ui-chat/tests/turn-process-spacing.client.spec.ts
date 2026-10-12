/** CSS checks for the process-row list spacing the 3.1.4-rc.2 alignment dropped. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/chat/${name}`, import.meta.url)), 'utf8')

describe('process-row spacing', () => {
  it('keeps the folded and expanded process lists on the widened rhythm', () => {
    const sheet = read('ChatGroupSeat.module.css')
    expect(sheet).toMatch(/\.body\s*\{[^}]*--dsh-chat-flow-gap:\s*56px/s)
    expect(sheet).toMatch(/\.expandedBody\s*\{[^}]*--dsh-chat-flow-gap:\s*56px/s)
    expect(sheet).toMatch(/margin-top:\s*var\(--dsh-chat-flow-gap,\s*8px\)/)
  })
})
