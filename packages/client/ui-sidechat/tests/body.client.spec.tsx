// @vitest-environment jsdom
/**
 * The panel body over hand-built state: the roster rail, the transcript, and
 * the composer's send, cancel, and release actions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { PARENT, fakeRemote, row, sid } from './fixtures.client.ts'
import { sidechatFace } from '../src/client/face.ts'
import type { SidechatInjected } from '../src/client/face.ts'
import { createSidechatSource } from '../src/client/sidechat-source.ts'
import { SidechatBody } from '../src/client/SidechatBody.tsx'
import type { SidechatBodyProps } from '../src/client/SidechatBody.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/**
 * Mount the body over a real face and source, with the remote scripted.
 * @param overrides - face method replacements and initial source mutation.
 * @returns the rendered view plus the face and source.
 */
function mount(overrides: {
  remote?: ReturnType<typeof fakeRemote>
  prepare?: (source: ReturnType<typeof createSidechatSource>) => void
  faceOverrides?: Partial<SidechatInjected>
} = {}): { view: ReturnType<typeof render>; source: ReturnType<typeof createSidechatSource>; face: SidechatInjected } {
  const source = createSidechatSource()
  overrides.prepare?.(source)
  const face = sidechatFace(source, overrides.remote ?? fakeRemote())
  const injected: SidechatInjected = { ...face, ...overrides.faceOverrides }
  const props: Partial<SidechatBodyProps> = {
    sessionId: PARENT,
    useSidechat: selector => selector(injected.hooks.sidechat.getSnapshot()),
    ...injected,
    t: makeTranslate(zh),
  }
  return { view: render(<SidechatBody {...(props as SidechatBodyProps)} />), source, face }
}

describe('SidechatBody', () => {
  it('shows the failure line when the roster read failed', () => {
    const { view } = mount({ prepare: (source) => { source.setPhase('failed') } })
    expect(view.container.textContent).toContain(zh['threads.failed'])
  })

  it('shows the empty roster line and the idle transcript hint', () => {
    const { view } = mount()
    expect(view.container.textContent).toContain(zh['threads.empty'])
    expect(view.container.textContent).toContain(zh['panel.empty'])
  })

  it('lists the roster and opens a thread through the face', () => {
    const faceOverrides = { openTranscript: vi.fn<SidechatInjected['openTranscript']>(() => () => {}) }
    const { view } = mount({
      prepare: (source) => {
        source.setThreads([row(), row({ id: sid('session-sidechat-b'), label: 'Side: second', live: true, running: true })])
        source.select(sid('session-sidechat-thread'))
      },
      faceOverrides,
    })
    expect(view.container.textContent).toContain('Side: hello there')
    expect(view.container.textContent).toContain('Side: second')
    expect(view.container.textContent).toContain(zh['thread.running'])
    const rows = view.container.querySelectorAll('ul > li > button')
    fireEvent.click(rows[1] as Element)
    expect(faceOverrides.openTranscript).toHaveBeenCalledWith(PARENT, sid('session-sidechat-b'))
  })

  it('sends the composer draft on Enter and clears the field', () => {
    const send = vi.fn<SidechatInjected['send']>(async () => true)
    const { view } = mount({
      prepare: (source) => {
        source.setThreads([row()])
        source.select(sid('session-sidechat-thread'))
      },
      faceOverrides: { send },
    })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '  follow-up  ' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    expect(send).toHaveBeenCalledWith(PARENT, sid('session-sidechat-thread'), 'follow-up')
    expect(input.value).toBe('')
  })

  it('ignores an empty or whitespace-only draft', () => {
    const send = vi.fn<SidechatInjected['send']>(async () => true)
    const { view } = mount({
      prepare: (source) => {
        source.setThreads([row()])
        source.select(sid('session-sidechat-thread'))
      },
      faceOverrides: { send },
    })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
  })

  it('offers cancel while the thread runs and release when it is live and idle', () => {
    const cancel = vi.fn<SidechatInjected['cancel']>(async () => true)
    const release = vi.fn<SidechatInjected['release']>(async () => {})
    const running = mount({
      prepare: (source) => {
        source.setThreads([row({ running: true })])
        source.select(sid('session-sidechat-thread'))
      },
      faceOverrides: { cancel, release },
    })
    const buttons = running.view.container.querySelectorAll<HTMLButtonElement>('.composer button, [class*="composerActions"] button')
    const texts = [...buttons].map(button => button.textContent)
    expect(texts).toContain(zh['thread.cancel'])
    fireEvent.click([...buttons].find(button => button.textContent === zh['thread.cancel']) as Element)
    expect(cancel).toHaveBeenCalledWith(sid('session-sidechat-thread'))

    const idle = mount({
      prepare: (source) => {
        source.setThreads([row({ live: true })])
        source.select(sid('session-sidechat-thread'))
      },
      faceOverrides: { cancel, release },
    })
    const idleButtons = idle.view.container.querySelectorAll<HTMLButtonElement>('[class*="composerActions"] button')
    fireEvent.click([...idleButtons].find(button => button.textContent === zh['thread.release']) as Element)
    expect(release).toHaveBeenCalledWith(PARENT, sid('session-sidechat-thread'))
  })
})
