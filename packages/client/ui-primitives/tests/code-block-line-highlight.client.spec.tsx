// @vitest-environment jsdom
/**
 * Line-level highlight, rendered arm: every arm of the code block (shiki,
 * plain, streaming) emits one `.line` per source line, the block adds no tab
 * stop per line, and the copy button still reads the whole source.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { CodeBlock as LocalizedCodeBlock } from '../src/markdown/CodeBlock.tsx'
import { markdownLabels } from './labels.client.ts'

afterEach(cleanup)

function CodeBlock(props: Omit<ComponentProps<typeof LocalizedCodeBlock>, 'copyLabel' | 'copiedLabel'>) {
  return <LocalizedCodeBlock {...props} {...markdownLabels.code} />
}

describe('code block line elements', () => {
  it.each([
    { lang: 'typescript', lineNumbers: false },
    { lang: 'typescript', lineNumbers: true },
    { lang: undefined, lineNumbers: false },
  ])('exposes one .line per source line ($lang, gutter: $lineNumbers)', ({ lang, lineNumbers }) => {
    const source = 'const a = 1\nconst b = 2\nconst c = 3'
    const view = render(<CodeBlock code={source} lang={lang} lineNumbers={lineNumbers} />)
    const lines = [...view.container.querySelectorAll('pre code > .line')]
    expect(lines.map(line => line.textContent)).toEqual(source.split('\n'))
  })

  it('adds no tab stop of its own: the pre stays the block single one', () => {
    const view = render(<CodeBlock code={'const a = 1\nconst b = 2'} lang="typescript" lineNumbers />)
    expect(view.container.querySelector('pre')?.getAttribute('tabindex')).toBe('0')
    for (const line of view.container.querySelectorAll('.line')) {
      expect(line.hasAttribute('tabindex')).toBe(false)
      expect(line.getAttribute('role')).toBeNull()
    }
    // Keyboard reach stays one stop per block, not one per line.
    expect(view.container.querySelectorAll('[tabindex]')).toHaveLength(1)
  })

  it('copies every source line unchanged, gutter excluded', async () => {
    const source = 'const a = 1\nconst b = 2'
    const writeText = vi.fn(() => Promise.resolve())
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      const view = render(<CodeBlock code={source} lang="typescript" lineNumbers />)
      fireEvent.click(view.container.querySelector('button')!)
      expect(writeText).toHaveBeenCalledWith(source)
    } finally {
      if (original === undefined) Reflect.deleteProperty(navigator, 'clipboard')
      else Object.defineProperty(navigator, 'clipboard', original)
    }
  })
})
