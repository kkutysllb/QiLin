// @vitest-environment jsdom
/** The document-level paste router: which composer a file paste addresses. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComposerFileIntakeTarget } from '../src/client/contract/slots.ts'
import { clipboardFiles, createComposerFileIntake } from '../src/client/input/file-intake.ts'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** One composer card in the document with the given routing facts. */
function target(over: Partial<ComposerFileIntakeTarget> = {}): ComposerFileIntakeTarget & { add: ReturnType<typeof vi.fn> } {
  const card = document.createElement('div')
  card.innerHTML = '<div contenteditable="true"></div>'
  document.body.appendChild(card)
  const add = vi.fn()
  return { card, main: true, accepts: () => true, add, ...over } as ComposerFileIntakeTarget & { add: ReturnType<typeof vi.fn> }
}

/** Dispatch one paste of a single file at the given node. */
function pasteFile(origin: EventTarget = document.body, type = 'image/png'): ClipboardEvent {
  const file = new File([Uint8Array.of(1)], 'shot.png', { type })
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [{ kind: 'file', getAsFile: () => file }], getData: () => '' } as unknown as DataTransfer,
  })
  origin.dispatchEvent(event)
  return event
}

describe('createComposerFileIntake', () => {
  it('routes a file paste outside an editable control into the main composer', () => {
    const register = createComposerFileIntake()
    const main = target()
    const dispose = register(main)
    const event = pasteFile()
    expect(main.add).toHaveBeenCalledOnce()
    expect((main.add.mock.calls[0]![0] as readonly File[]).map(file => file.name)).toEqual(['shot.png'])
    expect(event.defaultPrevented).toBe(true)
    dispose()
  })

  it('leaves a paste inside an editable control to that control', () => {
    const register = createComposerFileIntake()
    const main = target()
    register(main)
    const editable = document.createElement('textarea')
    document.body.appendChild(editable)
    const event = pasteFile(editable)
    expect(main.add).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('prefers the composer that most recently held focus while it accepts files', () => {
    const register = createComposerFileIntake()
    const main = target()
    const second = target({ main: false })
    register(main)
    register(second)
    second.card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    pasteFile()
    expect(second.add).toHaveBeenCalledOnce()
    expect(main.add).not.toHaveBeenCalled()
  })

  it('falls back to the main composer when the focused one refuses and skips hidden cards', () => {
    const register = createComposerFileIntake()
    const main = target()
    const refusing = target({ main: false, accepts: () => false })
    const hidden = target({ main: false })
    hidden.card.hidden = true
    register(main)
    register(refusing)
    register(hidden)
    refusing.card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    pasteFile()
    expect(main.add).toHaveBeenCalledOnce()
    expect(refusing.add).not.toHaveBeenCalled()
    expect(hidden.add).not.toHaveBeenCalled()
  })

  it('never addresses a composer behind the foreground dialog', () => {
    const register = createComposerFileIntake()
    const main = target()
    register(main)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    pasteFile()
    expect(main.add).not.toHaveBeenCalled()
    dialog.remove()
    pasteFile()
    expect(main.add).toHaveBeenCalledOnce()
  })

  it('installs its document listeners only while a composer is registered', () => {
    const register = createComposerFileIntake()
    const main = target()
    const dispose = register(main)
    dispose()
    pasteFile()
    expect(main.add).not.toHaveBeenCalled()
  })

  it('counts directory members reported by the entry API', () => {
    const transfer = {
      items: [
        { kind: 'file', getAsFile: () => new File(['a'], 'dir'), webkitGetAsEntry: () => ({ isDirectory: true }) },
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => null },
      ],
    } as unknown as DataTransfer
    const { files, directories } = clipboardFiles(transfer)
    expect(files.map(file => file.name)).toEqual(['dir'])
    expect([...directories].map(file => file.name)).toEqual(['dir'])
  })
})
