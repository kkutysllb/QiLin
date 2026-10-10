// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import type { PropsRenderFactories } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { markdownLabels } from '../src/client/markdown-labels.ts'
import { zh } from '../src/client/locale.ts'
import { DefaultReasoningBody, ReasoningContent } from '../src/client/chat/ReasoningContent.tsx'

afterEach(() => { cleanup() })

const t = makeTranslate(zh, commonZh)
// This suite renders the two components with plain stubs: no Session or Factory
// runtime is involved, so the framework seats they receive in production are
// stand-ins carrying only what these assertions read.
const factorySeats: PropsRenderFactories = { renderFactorySlot: () => null }

describe('reasoning content factory', () => {
  it('renders compact Markdown with Chat labels when the caller supplies none', () => {
    // The framework seats this component receives in production are stand-ins here.
    const props = { text: '**Bold** reasoning', running: false, t, ...factorySeats } as ComponentProps<typeof ReasoningContent>
    const view = render(<ReasoningContent {...props} />)
    expect(view.container.querySelector('strong')?.textContent).toBe('Bold')
  })

  it('uses caller-supplied labels unchanged', () => {
    const props = { text: 'plain', running: false, labels: markdownLabels(t), t, ...factorySeats } as ComponentProps<typeof ReasoningContent>
    const view = render(<ReasoningContent {...props} />)
    expect(view.getByText('plain')).toBeTruthy()
  })
})

describe('default reasoning body adapter', () => {
  it('renders one occurrence of the same content factory third-party wrappers call', () => {
    const renderFactorySlot = vi.fn(() => null)
    const props = { text: 'original reasoning', running: true, renderFactorySlot } as ComponentProps<typeof DefaultReasoningBody>
    render(<DefaultReasoningBody {...props} />)
    expect(renderFactorySlot).toHaveBeenCalledWith('conversation.chat.reasoning.content', { text: 'original reasoning', running: true })
  })
})
