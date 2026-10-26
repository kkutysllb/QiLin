// @vitest-environment jsdom
import { Context } from '@qilin-agent/kylin'
import { createScope, scopeOf } from '@qilin-agent/api-session-controller/client'
import type { ToolCallId } from '@qilin-agent/llm'
import type { SessionId } from '@qilin-agent/session/types'
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalPanel } from '../src/client/ApprovalPanel.tsx'
import type { ApprovalComposerProps, ApprovalPresentationRequest } from '../src/client/contract/slots.ts'
import { PendingApproval } from '../src/client/contract/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

type ApprovalListener = (
  this: Context,
  request: {
    toolName: string
    callId?: string
    reason?: string
    signal?: AbortSignal
  },
  next: () => Promise<'unavailable'>,
) => Promise<unknown>

/** The slot registration the plugin installs, as the registry would receive it. */
type CapturedRegistration = {
  options: {
    select(props: { pendingInteraction: PendingApproval | undefined }): PendingApproval | null
    inject?: () => {
      resolveReason: (reason: NonNullable<PendingApproval['displayReason']>) => string
    }
  }
  component: unknown
}

interface PluginBench {
  readonly ctx: Context
  readonly listener: ApprovalListener
  readonly pending: { getSnapshot(): readonly PendingApproval[] }
  readonly registerPendingInteraction: ReturnType<typeof vi.fn>
  readonly disposeSlot: ReturnType<typeof vi.fn>
  readonly disposeLocale: ReturnType<typeof vi.fn>
  readonly register: ReturnType<typeof vi.fn>
  readonly injectSlot: ReturnType<typeof vi.fn>
  readonly shortcuts: { id: string; label: () => string; keys: readonly string[]; group: string }[]
  readonly resolveText: ReturnType<typeof vi.fn>
  releasePending(): Promise<void>
  registration(): CapturedRegistration
}

function setupPlugin(): PluginBench {
  const ctx = new Context()
  let listener: ApprovalListener | undefined
  let registration: CapturedRegistration | undefined
  const disposeSlot = vi.fn()
  const disposeLocale = vi.fn()
  const pending = new Map<PendingApproval, () => Promise<void>>()
  const registerPendingInteraction = vi.fn((_precedence: (value: PendingApproval) => number) => (
    value: PendingApproval,
    delegate: () => Promise<void>,
  ) => {
    _precedence(value)
    pending.set(value, delegate)
    return () => { pending.delete(value) }
  })
  const shortcuts: { id: string; label: () => string; keys: readonly string[]; group: string }[] = []
  // locale.resolveText picks the active language out of the requester's record.
  const resolveText = vi.fn((reason: { readonly en: string }) => reason.en)
  const register = vi.fn((
    options: CapturedRegistration['options'],
    component: unknown,
  ) => {
    registration = { options, component }
    return disposeSlot
  })
  const injectSlot = vi.fn((_name: string, mount: () => () => void) => {
    const dispose = ctx.effect(() => mount())
    return () => { void dispose() }
  })
  ctx.provide('remote', {
    $on: (_event: string, callback: ApprovalListener) => {
      listener = callback
      return () => {}
    },
  } as never)
  ctx.provide('sessions', { scopeOf } as never)
  ctx.provide('uiSession', { registerPendingInteraction } as never)
  ctx.provide('slots', { inject: injectSlot, register } as never)
  ctx.provide('locale', {
    register: vi.fn(() => disposeLocale),
    bind: () => (key: string) => key,
    resolveText,
  } as never)
  // The fixed Enter/Escape references are installed only when a shortcuts
  // registry is composed; the bench records what the plugin contributes.
  ctx.provide('shortcuts', {
    registerFixed: (command: { id: string; label: () => string; keys: readonly string[]; group: string }) => {
      shortcuts.push(command)
      return () => { shortcuts.splice(shortcuts.indexOf(command), 1) }
    },
  } as never)

  apply(ctx)
  if (listener === undefined) throw new Error('approval listener was not registered')
  return {
    ctx,
    listener,
    pending: { getSnapshot: () => [...pending.keys()] },
    registerPendingInteraction,
    disposeSlot,
    disposeLocale,
    register,
    injectSlot,
    shortcuts,
    resolveText,
    async releasePending() {
      const delegates = [...pending.values()]
      pending.clear()
      await Promise.allSettled(delegates.map(delegate => delegate()))
    },
    registration: () => {
      if (registration === undefined) throw new Error('approval slot was not registered')
      return registration
    },
  }
}

const id = (value: string): SessionId => value as SessionId

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PendingApproval', () => {
  it('resolves once, removes its abort listener, and ignores later abort cleanup', async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const pending = new PendingApproval(id('s1'), {
      toolName: 'bash',
      callId: 'call-1' as ToolCallId,
      reason: 'needs access',
      signal: controller.signal,
    })

    await pending.answer('allowed-once')

    await expect(pending.result).resolves.toBe('allowed-once')
    expect(pending.sessionId).toBe(id('s1'))
    expect(pending.toolName).toBe('bash')
    expect(pending.callId).toBe('call-1')
    expect(pending.reason).toBe('needs access')
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(() => { pending.abort(new Error('late')) }).not.toThrow()
    expect(() => { pending.delegate() }).not.toThrow()
    await expect(pending.answer('rejected')).rejects.toThrow(/already settled/)
  })

  it('rejects with an already-aborted signal reason', async () => {
    const controller = new AbortController()
    const reason = new Error('host cancelled')
    controller.abort(reason)

    const pending = new PendingApproval(id('s1'), {
      toolName: 'read',
      signal: controller.signal,
    })

    await expect(pending.result).rejects.toBe(reason)
  })

  it('uses a stable fallback when an abort signal supplies no reason', async () => {
    const signal = {
      aborted: true,
      reason: undefined,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal

    const pending = new PendingApproval(id('s1'), { toolName: 'read', signal })

    await expect(pending.result).rejects.toThrow('approval request was aborted')
  })

  it('rejects an unanswered request explicitly without an AbortSignal', async () => {
    const pending = new PendingApproval(id('s1'), { toolName: 'write' })
    const reason = new Error('scope released')

    pending.abort(reason)

    await expect(pending.result).rejects.toBe(reason)
  })

  it('wraps a non-Error answer settlement failure with its cause', async () => {
    const failure = 'resolve failed'
    const completion = Promise.withResolvers<'allowed-once' | 'rejected'>()
    const withResolvers = vi.spyOn(Promise, 'withResolvers').mockImplementationOnce(() => ({
      promise: completion.promise,
      resolve: () => { throw failure },
      reject: completion.reject,
    }))
    const pending = new PendingApproval(id('s1'), { toolName: 'write' })
    withResolvers.mockRestore()

    const settlement = await pending.answer('allowed-once').catch((error: unknown) => error)

    expect(settlement).toBeInstanceOf(Error)
    expect(settlement).toMatchObject({
      message: 'pending approval settlement failed',
      cause: failure,
    })
    completion.resolve('allowed-once')
    await expect(pending.result).resolves.toBe('allowed-once')
  })
})

describe('approval Remote Event consumer', () => {
  it('delegates an event that has no Agent scope', async () => {
    const bench = setupPlugin()
    const next = vi.fn(() => Promise.resolve<'unavailable'>('unavailable'))

    await expect(bench.listener.call(bench.ctx, { toolName: 'bash' }, next))
      .resolves.toBe('unavailable')
    expect(next).toHaveBeenCalledOnce()
    expect(bench.pending.getSnapshot()).toEqual([])
    expect(bench.register).toHaveBeenCalledOnce()
  })

  it('publishes one scoped takeover, returns the answer, and keeps stable registrations', async () => {
    const bench = setupPlugin()
    const scope = createScope(bench.ctx, id('s1'))
    await scope.fiber.await()
    const controller = new AbortController()
    const next = vi.fn(() => Promise.resolve<'unavailable'>('unavailable'))
    const result = bench.listener.call(scope.ctx, {
      toolName: 'bash',
      callId: 'call-1',
      reason: 'needs access',
      signal: controller.signal,
    }, next)
    const pending = bench.pending.getSnapshot()[0]!
    const { options, component } = bench.registration()

    expect(component).toBe(ApprovalPanel)
    expect(options.select({ pendingInteraction: undefined })).toBeNull()
    expect(options.select({ pendingInteraction: pending })).toBe(pending)
    expect(pending).toMatchObject({
      kind: 'approval',
      sessionId: id('s1'),
      toolName: 'bash',
      callId: 'call-1',
      reason: 'needs access',
    })

    await pending.answer('allowed-once')

    await expect(result).resolves.toBe('allowed-once')
    expect(next).not.toHaveBeenCalled()
    expect(bench.pending.getSnapshot()).toEqual([])
    expect(bench.register).toHaveBeenCalledOnce()
    expect(bench.disposeSlot).not.toHaveBeenCalled()
    await scope.fiber.dispose()
  })

  it('propagates request cancellation after removing the pending object', async () => {
    const bench = setupPlugin()
    const scope = createScope(bench.ctx, id('s1'))
    await scope.fiber.await()
    const controller = new AbortController()
    const reason = new Error('cancelled by host')
    const result = bench.listener.call(scope.ctx, {
      toolName: 'bash',
      signal: controller.signal,
    }, () => Promise.resolve('unavailable'))
    expect(bench.pending.getSnapshot()).toHaveLength(1)

    controller.abort(reason)

    await expect(result).rejects.toBe(reason)
    expect(bench.pending.getSnapshot()).toEqual([])
    expect(bench.disposeSlot).not.toHaveBeenCalled()
    await scope.fiber.dispose()
  })

  it('delegates an active request when its interaction domain unloads', async () => {
    const bench = setupPlugin()
    const scope = createScope(bench.ctx, id('s1'))
    await scope.fiber.await()
    const next = vi.fn(() => Promise.resolve<'unavailable'>('unavailable'))
    const result = bench.listener.call(scope.ctx, { toolName: 'bash' }, next)
    expect(bench.pending.getSnapshot()).toHaveLength(1)

    await bench.releasePending()

    await expect(result).resolves.toBe('unavailable')
    expect(next).toHaveBeenCalledOnce()
    expect(bench.pending.getSnapshot()).toEqual([])
    await scope.fiber.dispose()
  })

  it('publishes a scoped request without optional request metadata', async () => {
    const bench = setupPlugin()
    const scope = createScope(bench.ctx, id('s1'))
    await scope.fiber.await()
    const result = bench.listener.call(scope.ctx, { toolName: 'read' }, () => Promise.resolve('unavailable'))
    const pending = bench.pending.getSnapshot()[0]!

    await pending.answer('rejected')

    await expect(result).resolves.toBe('rejected')
    expect(pending).toMatchObject({ toolName: 'read' })
    expect(pending.callId).toBeUndefined()
    expect(pending.reason).toBeUndefined()
    await scope.fiber.dispose()
  })

  it('removes stable registrations with the plugin lifetime', async () => {
    const bench = setupPlugin()
    await bench.ctx.fiber.dispose()
    expect(bench.disposeSlot).toHaveBeenCalledOnce()
    expect(bench.disposeLocale).toHaveBeenCalledOnce()
  })
})

function panelProps(
  pending: PendingApproval,
  renderSlot: ApprovalComposerProps['renderSlot'] = vi.fn(() => null),
  resolveReason: ApprovalComposerProps['resolveReason'] = reason => reason.en,
): ApprovalComposerProps {
  const messages: Record<string, string> = {
    waiting: 'Waiting',
    'detail.aria': 'Approval details',
    escalation: `Tool ${pending.toolName} asks`,
    reject: 'Reject',
    allowOnce: 'Allow once',
  }
  return {
    matched: pending,
    renderSlot,
    resolveReason,
    t: (key: string) => messages[key] ?? key,
  } satisfies Partial<ApprovalComposerProps> as ApprovalComposerProps
}

describe('ApprovalPanel', () => {
  it('renders fallback copy without detail and returns rejection', async () => {
    const pending = new PendingApproval(id('s1'), { toolName: 'bash' })
    const props = panelProps(pending)
    render(<ApprovalPanel {...props} />)

    expect(screen.getByText('Tool bash asks')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Approval details' })).toBeTruthy()
    expect(props.renderSlot).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await expect(pending.result).resolves.toBe('rejected')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Reject' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Allow once' }).disabled).toBe(true)
  })

  it('renders correlated detail and returns allow-once', async () => {
    const pending = new PendingApproval(id('s1'), {
      toolName: 'bash',
      callId: 'call-1' as ToolCallId,
      reason: 'Run this exact command',
    })
    const renderSlot = vi.fn(() => <code>pnpm test</code>)
    render(<ApprovalPanel {...panelProps(pending, renderSlot)} />)

    expect(screen.getByText('Run this exact command')).toBeTruthy()
    expect(screen.getByText('pnpm test')).toBeTruthy()
    expect(renderSlot).toHaveBeenCalledWith('conversation.approval.detail', {
      callId: 'call-1',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))

    await expect(pending.result).resolves.toBe('allowed-once')
  })

  it('re-enables actions when answering fails', async () => {
    const pending = new PendingApproval(id('s1'), { toolName: 'bash' })
    vi.spyOn(pending, 'answer').mockRejectedValue(new Error('transport closed'))
    render(<ApprovalPanel {...panelProps(pending)} />)

    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Allow once' }).disabled).toBe(true)
    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Allow once' }).disabled).toBe(false)
    })
    pending.abort(new Error('test cleanup'))
    await pending.result.catch(() => {})
  })
})

describe('ApprovalPanel fixed keys', () => {
  /** Render the takeover with focus parked inside its own detail group. */
  function mountFlow(pending: PendingApproval, renderSlot?: ApprovalComposerProps['renderSlot']) {
    render(<ApprovalPanel {...panelProps(pending, renderSlot)} />)
    const box = screen.getByRole('group', { name: 'Approval details' })
    box.focus()
    return box
  }

  /** One pending request plus a spy that keeps an ignored gesture observable. */
  function watched(request: ApprovalPresentationRequest = { toolName: 'bash' }) {
    const pending = new PendingApproval(id('s1'), request)
    return { pending, answer: vi.spyOn(pending, 'answer') }
  }

  /** Settle a request whose panel never answered it. */
  async function abandon(pending: PendingApproval): Promise<void> {
    pending.abort(new Error('test cleanup'))
    await pending.result.catch(() => {})
  }

  it('allows with Enter and rejects with Escape while focus is inside the panel', async () => {
    const allowed = new PendingApproval(id('s1'), { toolName: 'bash' })
    fireEvent.keyDown(mountFlow(allowed), { key: 'Enter' })
    await expect(allowed.result).resolves.toBe('allowed-once')
    cleanup()

    const rejected = new PendingApproval(id('s1'), { toolName: 'bash' })
    fireEvent.keyDown(mountFlow(rejected), { key: 'Escape' })
    await expect(rejected.result).resolves.toBe('rejected')
  })

  it('ignores a gesture another handler already consumed', async () => {
    const { pending, answer } = watched()
    const box = mountFlow(pending)
    const consumed = createEvent.keyDown(box, { key: 'Enter' })
    consumed.preventDefault()
    fireEvent(box, consumed)
    expect(answer).not.toHaveBeenCalled()
    await abandon(pending)
  })

  it('ignores a gesture while focus is outside the panel', async () => {
    const { pending, answer } = watched()
    const box = mountFlow(pending)
    box.blur()
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(answer).not.toHaveBeenCalled()
    await abandon(pending)
  })

  it('leaves a focused editable control its own keys', async () => {
    const { pending, answer } = watched({ toolName: 'bash', callId: 'call-1' as ToolCallId })
    mountFlow(pending, () => <textarea data-testid="approval-command" defaultValue="pnpm test" />)
    const command = screen.getByTestId('approval-command')
    command.focus()
    fireEvent.keyDown(command, { key: 'Enter' })
    fireEvent.keyDown(command, { key: 'Escape' })
    expect(answer).not.toHaveBeenCalled()
    await abandon(pending)
  })

  it('ignores keys other than Enter and Escape', async () => {
    const { pending, answer } = watched()
    fireEvent.keyDown(mountFlow(pending), { key: 'a' })
    expect(answer).not.toHaveBeenCalled()
    await abandon(pending)
  })

  it('leaves Enter on a focused control to that control, while Escape still rejects', async () => {
    const { pending, answer } = watched()
    mountFlow(pending)
    const allow = screen.getByRole('button', { name: 'Allow once' })
    allow.focus()
    fireEvent.keyDown(allow, { key: 'Enter' })
    expect(answer).not.toHaveBeenCalled()

    // Escape is not a control activation: it rejects from wherever focus sits.
    fireEvent.keyDown(allow, { key: 'Escape' })
    expect(answer).toHaveBeenCalledWith('rejected')
    await pending.result
  })

  it.each([
    { name: 'Control', init: { ctrlKey: true } },
    { name: 'Meta', init: { metaKey: true } },
    { name: 'Alt', init: { altKey: true } },
    { name: 'Shift', init: { shiftKey: true } },
  ])('ignores Enter carrying the $name modifier', async ({ init }) => {
    const { pending, answer } = watched()
    fireEvent.keyDown(mountFlow(pending), { key: 'Enter', ...init })
    expect(answer).not.toHaveBeenCalled()
    await abandon(pending)
  })

  it('ignores a repeated, composing, or IME-229 Enter', async () => {
    const { pending, answer } = watched()
    const box = mountFlow(pending)
    fireEvent.keyDown(box, { key: 'Enter', repeat: true })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 })
    expect(answer).not.toHaveBeenCalled()
    await abandon(pending)
  })

  it('answers once while a decision is still in flight', () => {
    const pending = new PendingApproval(id('s1'), { toolName: 'bash' })
    // A decision the transport never acknowledges keeps the panel waiting.
    const answer = vi.spyOn(pending, 'answer').mockImplementation(() => new Promise<void>(() => {}))
    const box = mountFlow(pending)
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(answer).toHaveBeenCalledOnce()
    pending.abort(new Error('test cleanup'))
    void pending.result.catch(() => {})
  })

  it('does nothing when the answer fails after the panel unmounted', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = new PendingApproval(id('s1'), { toolName: 'bash' })
    const answer = vi.spyOn(pending, 'answer').mockRejectedValue(new Error('transport closed'))
    const view = render(<ApprovalPanel {...panelProps(pending)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    view.unmount()
    for (let round = 0; round < 4; round++) await Promise.resolve()

    expect(answer).toHaveBeenCalledOnce()
    expect(reported).not.toHaveBeenCalled()
    reported.mockRestore()
    await abandon(pending)
  })

  it('shows the requester display copy resolved for the active language', () => {
    const pending = new PendingApproval(id('s1'), {
      toolName: 'bash',
      displayReason: { en: 'Custom copy', zh: '自定义文案' },
    })
    const resolveReason = vi.fn(() => '自定义文案')
    render(<ApprovalPanel {...panelProps(pending, undefined, resolveReason)} />)

    expect(screen.getByText('自定义文案')).toBeTruthy()
    expect(resolveReason).toHaveBeenCalledWith({ en: 'Custom copy', zh: '自定义文案' })
    void pending.result.catch(() => {})
  })
})

describe('approval registrations', () => {
  it('carries the requester-supplied display copy through to the composer', async () => {
    const bench = setupPlugin()
    const scope = createScope(bench.ctx, id('s1'))
    await scope.fiber.await()
    const result = bench.listener.call(scope.ctx, {
      toolName: 'bash',
      displayReason: { en: 'The tool wants to run a command', zh: '工具想要运行命令' },
    }, () => Promise.resolve('unavailable'))
    const pending = bench.pending.getSnapshot()[0]!
    expect(pending.displayReason).toEqual({ en: 'The tool wants to run a command', zh: '工具想要运行命令' })

    await pending.answer('allowed-once')
    await expect(result).resolves.toBe('allowed-once')
    await scope.fiber.dispose()
  })

  it('installs the fixed Enter and Escape references until the plugin leaves', async () => {
    const bench = setupPlugin()
    await vi.waitFor(() => { expect(bench.shortcuts).toHaveLength(2) })
    expect(bench.shortcuts.map(row => [row.id, row.group, row.keys]))
      .toEqual([['approval.allow', 'approval', ['Enter']], ['approval.reject', 'approval', ['Esc']]])
    // The references carry dictionary keys resolved on demand, not frozen copy.
    expect(bench.shortcuts.map(row => row.label())).toEqual(['allowOnce', 'reject'])

    await bench.ctx.fiber.dispose()
    expect(bench.shortcuts).toEqual([])
  })

  it('resolves Tool-owned copy through the locale on the registration inject face', async () => {
    const bench = setupPlugin()
    const inject = bench.registration().options.inject
    if (inject === undefined) throw new Error('the composer registration carries no inject face')

    expect(inject().resolveReason({ en: 'Custom copy', zh: '自定义文案' })).toBe('Custom copy')
    expect(bench.resolveText).toHaveBeenCalledWith({ en: 'Custom copy', zh: '自定义文案' })
    await bench.ctx.fiber.dispose()
  })
})

describe('package entries', () => {
  it('declares its service edges and keeps the Host half inert', () => {
    expect(inject).toEqual(['sessions', 'remote', 'uiSession', 'slots', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })
})
