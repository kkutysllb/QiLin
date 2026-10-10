// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { PropsRenderSlots } from '@qilin-agent/client-ui-slots'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import type { TranscriptViewMode } from '../src/chat-settings.ts'
import { derivePresentationPolicy, type CollapseTiming } from '../src/client/presentation-policy.ts'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locale.ts'
import { MarkdownText } from '@qilin-agent/client-ui-primitives'
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx'
import { markdownLabels } from '../src/client/markdown-labels.ts'
import { useSearchableHidden } from '../src/client/chat/searchable-hidden.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh, commonZh)
const renderMessageImages: AssistantMarkdownProps['renderMessageImages'] = () => null
// This suite exercises the disclosure, so its Body slot renders the shipped
// content the default adapter would show.
// The framework hands a slot implementation its own generic signature; this
// suite implements the one declared Body slot, so it narrows to that member.
const renderReasoningBody = (
  (_name: string, props: { text: string; running: boolean }) =>
    <MarkdownText text={props.text} streaming={props.running} labels={markdownLabels(t)} variant="compact" />
) as unknown as PropsRenderSlots<'conversation.chat.reasoning.body'>['renderSlot']

describe('ReasoningRow', () => {
  it.each([
    { kind: 'text' as const, text: 'Answer' },
    { kind: 'tool-call' as const, callId: 'call-1', name: 'read', argsRaw: '{}' },
  ])('starts collapsed and preserves manual expansion when $kind arrives', (nextBlock) => {
    const reasoning = { kind: 'reasoning' as const, text: 'Inspect the session\nCheck persistence' }
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody} t={t} blocks={[reasoning]} streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden} />,
    )
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(view.getByText('思考'))
    view.rerender(
      <AssistantMarkdown
        renderSlot={renderReasoningBody} t={t} blocks={[reasoning, nextBlock]} streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden} />,
    )
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    view.rerender(
      <AssistantMarkdown
        renderSlot={renderReasoningBody} t={t} blocks={[reasoning, nextBlock]} streaming={false}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden} />,
    )
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(/Check persistence/)).toBeTruthy()
    fireEvent.click(view.getByText('思考'))
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('follows the latest streaming line, then restores the settled first line', () => {
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest reasoning tokens' }]}
        streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    expect(view.getByText('运行中')).toBeTruthy()
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    expect(view.getByText('Newest reasoning tokens').parentElement?.getAttribute('data-follow-end'))
      .toBe('true')

    view.rerender(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest reasoning tokens keep arriving' }]}
        streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    expect(view.getByText('Newest reasoning tokens keep arriving').parentElement
      ?.getAttribute('data-follow-end')).toBe('true')

    view.rerender(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest reasoning tokens keep arriving\n' }]}
        streaming={false}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    const settledSummary = view.getByText('Inspect the session')
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByText('运行中')).toBeNull()
    expect(settledSummary.parentElement?.hasAttribute('data-follow-end')).toBe(false)
  })

  it('expands from either Think or the reasoning summary', () => {
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nCheck persistence' }]}
        streaming={false}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    const row = view.getByRole('button')

    fireEvent.click(view.getByText('Inspect the session'))
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(/Check persistence/)).toBeTruthy()

    fireEvent.click(view.getByText('思考'))
    expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it.each([
    {
      label: 'settled',
      text: '**Comparing checkout and merge bases**\nKeep **reviewing**',
      streaming: false,
    },
    {
      label: 'streaming',
      text: 'Inspect the session\n**Comparing checkout and merge bases**',
      streaming: true,
    },
  ])('strips double-asterisk markers from the $label summary and renders body emphasis', ({ text, streaming }) => {
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text }]}
        streaming={streaming}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )

    expect(view.getByText('Comparing checkout and merge bases')).toBeTruthy()
    expect(view.queryByText('**Comparing checkout and merge bases**')).toBeNull()

    fireEvent.click(view.getByText('思考'))
    expect(view.getByText('Comparing checkout and merge bases').tagName).toBe('STRONG')
    expect(view.container.querySelector('[class*="thinkBody"]')?.textContent).not.toContain('**')
  })

  it('keeps heading syntax in the collapsed summary and renders compact headings when expanded', () => {
    const text = Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} Section ${index + 1}`)
      .join('\n\n') + '\n\nReasoning body.'
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text }]}
        streaming={false}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    const summary = view.getByText('# Section 1')
    expect(summary.tagName).toBe('SPAN')
    expect(view.queryByRole('heading')).toBeNull()

    fireEvent.click(summary)
    const compact = view.container.querySelector('[data-markdown-variant="compact"]')
    expect(compact).not.toBeNull()
    expect(compact?.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(6)
    expect(compact?.querySelector('p')?.textContent).toBe('Reasoning body.')

    fireEvent.click(view.getByText('思考'))
    expect(view.getByText('# Section 1').tagName).toBe('SPAN')
    expect(view.queryByRole('heading')).toBeNull()
  })

  it('keeps completed reasoning blocks mounted while the open streaming tail grows', () => {
    const first = '## Investigation\n\n**Check persistence**\n\n'
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: first }]}
        streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    fireEvent.click(view.getByText('思考'))
    const heading = view.getByRole('heading', { name: 'Investigation' })
    const emphasis = view.getByText('Check persistence')
    const text = first + Array.from({ length: 8 }, (_, index) => `Paragraph ${index}.`).join('\n\n')
    view.rerender(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text }]}
        streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    expect(view.getByRole('heading', { name: 'Investigation' })).toBe(heading)
    expect(view.getByText('Check persistence')).toBe(emphasis)
    expect(view.container.querySelector('[class*="thinkBody"]')?.textContent).not.toContain('##')
  })

  it('expanded Think drops the inline summary and renders prose without an IN card', () => {
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nCheck persistence' }]}
        streaming={false}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    fireEvent.click(view.getByText('思考'))
    expect(view.getAllByText(/Inspect the session/)).toHaveLength(1)
    expect(view.queryByText('IN')).toBeNull()
    expect(view.container.querySelector('[class*="ioCard"]')).toBeNull()
    expect(view.container.querySelector('[class*="thinkBody"]')).not.toBeNull()
  })

  it('anchors the sticky-header selector: only an open Think row nests the disclosure row under data-expanded and data-open', () => {
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[
          { kind: 'reasoning', text: 'Inspect the session\nCheck persistence' },
          { kind: 'text', text: 'Answer' },
        ]}
        streaming={false}
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      />,
    )
    // Collapsed: no `data-open`, so the sticky rule's gate never matches.
    expect(view.container.querySelector('[data-variant="think"] [data-open]')).toBeNull()
    fireEvent.click(view.getByText('思考'))
    expect(
      view.container.querySelector(
        '[data-variant="think"][data-expanded] [data-open] [data-disclosure-row]',
      ),
    ).not.toBeNull()
  })
})

describe('ReasoningRow settled preview by work-details mode', () => {
  const rendering = (mode: TranscriptViewMode) => render(
    <AssistantMarkdown
      renderSlot={renderReasoningBody}
      t={t}
      blocks={[{ kind: 'reasoning', text: 'Inspect the session\nCheck persistence' }]}
      streaming={false}
      renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      usePresentation={bindSnapshotSelector(derivePresentationPolicy(
        createSnapshotStore(mode), createSnapshotStore<CollapseTiming>('completion'),
      ))}
    />,
  )

  it('compact drops the settled preview: a bare Think title', () => {
    const view = rendering('compact')
    // The preview fact is off; the stylesheet hides the separator and summary
    // behind [data-preview], so jsdom asserts the attribute, not computed CSS.
    expect(view.container.querySelector('[data-variant="think"]')?.hasAttribute('data-preview')).toBe(false)
    // The body stays reachable through the title toggle.
    fireEvent.click(view.getByRole('button'))
    expect(view.getByText(/Check persistence/)).toBeTruthy()
  })

  it.each(['standard', 'detailed', 'verbose'] as const)(
    '%s previews the settled first line beside the title',
    (mode) => {
      const view = rendering(mode)
      expect(view.container.querySelector('[data-variant="think"]')?.hasAttribute('data-preview')).toBe(true)
      expect(view.getByText('Inspect the session')).toBeTruthy()
    },
  )

  it('a streaming tail always previews, even in compact', () => {
    const view = render(
      <AssistantMarkdown
        renderSlot={renderReasoningBody}
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest tokens' }]}
        streaming
        renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
        usePresentation={bindSnapshotSelector(derivePresentationPolicy(
          createSnapshotStore('compact'), createSnapshotStore<CollapseTiming>('completion'),
        ))}
      />,
    )
    expect(view.getByText('Newest tokens')).toBeTruthy()
  })
})
