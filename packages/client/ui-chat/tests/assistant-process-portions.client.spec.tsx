// @vitest-environment jsdom

/**
 * One Assistant step can own two seats: the enclosing process group renders its
 * reasoning, and the Turn's answer seat renders the reply. Each seat must carry
 * only its own portion, or a step that both thinks and answers shows the reply
 * twice (see the compact tool-details and seeded-history browser scenarios).
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locale.ts'
import { AssistantMarkdown } from '../src/client/chat/AssistantMarkdown.tsx'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../src/client/contract/slots.ts'
import type { AssistantBlock } from '../src/client/contract/snapshot.ts'
import { useSearchableHidden } from '../src/client/chat/searchable-hidden.ts'

afterEach(cleanup)

const t: ChatViewSlotProps['t'] = makeTranslate(zh, commonZh)
const renderMessageImages: ChatNodeOwnerProps['renderMessageImages'] = () => null

const REASONING = 'Both files have been read, so I will reply with the marker.'
const REPLY = 'DONE_MARKER'

function step(): AssistantBlock[] {
  return [
    { kind: 'reasoning', text: REASONING },
    { kind: 'text', text: REPLY },
  ]
}

function seatText(groupPart: string | undefined): string {
  const view = render(
    <AssistantMarkdown
      groupPart={groupPart}
      blocks={step()}
      streaming={false}
      renderMessageImages={renderMessageImages} useGroupAction={useSearchableHidden}
      t={t}
    />,
  )
  const text = view.container.textContent ?? ''
  view.unmount()
  return text
}

describe('AssistantMarkdown process portions', () => {
  it('splits one step across its group and answer seats without overlapping', () => {
    const group = seatText('reasoning')
    const answer = seatText('response')
    expect(group).toContain(REASONING)
    expect(group).not.toContain(REPLY)
    expect(answer).toContain(REPLY)
    expect(answer).not.toContain(REASONING)
  })

  it('renders every block when the step owns a single seat', () => {
    const whole = seatText(undefined)
    expect(whole).toContain(REASONING)
    expect(whole).toContain(REPLY)
  })
})
