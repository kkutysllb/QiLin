/**
 * Row spacing and fold motion for the work-details modes as CSS text. jsdom has
 * no layout, so the rendering specs pin which elements the modes render and
 * these read the declarations that decide how those rows sit.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/chat/${name}`, import.meta.url)), 'utf8')

/** Declarations of the rule whose selector list names `selector` verbatim. */
function declarationsFrom(source: string, selector: string): string[] {
  const declarationText = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const rule of declarationText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map(part => part.trim())
    if (!selectors.includes(selector)) continue
    return (rule[2] ?? '').split(';').map(part => part.trim()).filter(Boolean)
  }
  throw new Error(`no \`${selector}\` rule`)
}

function hasRule(source: string, selector: string): boolean {
  try {
    declarationsFrom(source, selector)
    return true
  } catch {
    // The absence of a rule is the assertion for the removed overrides.
    return false
  }
}

describe('process-group row spacing', () => {
  it('removes the group-level cap without changing the row rhythm', () => {
    expect(declarationsFrom(read('ChatGroupSeat.module.css'), '.expandedBody'))
      .toEqual(expect.arrayContaining(['max-height: none']))
  })

  it('separates an Assistant response from its neighbours by 12px', () => {
    expect(declarationsFrom(read('ChatView.module.css'), '.flowItem[data-chat-group-part="response"]'))
      .toEqual(expect.arrayContaining(['--qilin-chat-flow-gap: 12px']))
  })

  it('keeps 16px clearance around the Turn process control', () => {
    expect(declarationsFrom(read('ChatView.module.css'), '.flowItem[data-chat-flow-kind="turn-process"]'))
      .toEqual(expect.arrayContaining(['--qilin-chat-flow-gap: 16px']))
  })
})

describe('new-message fold motion', () => {
  it('closes process details in one movement while an input fold runs', () => {
    const css = read('ChatView.module.css')
    expect(declarationsFrom(css, '.column[data-input-fold] > :not([data-chat-motion])'))
      .toEqual(expect.arrayContaining(['transition: none']))
  })

  it('shares the fold clock with spacing changes outside an input fold', () => {
    expect(declarationsFrom(read('ChatView.module.css'), '.column[data-chat-motion] > :not([data-chat-motion])'))
      .toEqual(expect.arrayContaining(['transition: margin-top 160ms cubic-bezier(0.4, 0, 0.2, 1)']))
  })
})

describe('streaming reasoning summary', () => {
  it('fades the streaming summary edge instead of right-aligning it', () => {
    const css = read('ReasoningRow.module.css')
    expect(declarationsFrom(css, '.summary[data-streaming]'))
      .toEqual(expect.arrayContaining(['mask-image: linear-gradient(to right, black calc(100% - 48px), transparent)']))
    expect(hasRule(css, '.summary[data-follow-end]')).toBe(false)
  })
})
