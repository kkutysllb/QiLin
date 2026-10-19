/** CSS checks for the process-row spacing rc.2 documents for both group-body states. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/chat/${name}`, import.meta.url)), 'utf8')

describe('process-row spacing', () => {
  it('keeps the folded and expanded process lists on one 6px rhythm', () => {
    const sheet = read('ChatGroupSeat.module.css')
    expect(sheet).toMatch(/\.body\s*\{[^}]*--dsh-chat-flow-gap:\s*6px/s)
    // rc.2 drops the wider uncapped-body rhythm: process rows keep 6px in
    // Detailed and Verbose too.
    expect(sheet).not.toMatch(/\.expandedBody\s*\{[^}]*--dsh-chat-flow-gap/s)
    expect(sheet).toMatch(/margin-top:\s*var\(--dsh-chat-flow-gap,\s*6px\)/)
  })
})
