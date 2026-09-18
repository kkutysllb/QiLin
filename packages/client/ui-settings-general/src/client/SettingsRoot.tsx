/**
 * Settings shell root: the full-window settings page (figma 501:29947) with
 * the resizable section nav rail, plus the closed-panel sidebar foot row for
 * connection recovery and desktop updates. The shell is a pure composition
 * face — slot-owned text (panel title, close label, sections) arrives from
 * registrants through slots; accessible names resolve from localized content
 * (dialog: aria-labelledby the title node; close: visually-hidden slot text).
 * The account menu owns the visible Settings entry point and reaches this shell
 * through `ctx.settingsShell`. Modal open state, the active section id, and the
 * nav width are component-local viewing state; the onboarding coordinator
 * mounts exactly one ordered registrant while the sessions-derived empty-Hero
 * fact is active. Visible dialog chrome belongs to the step, so a
 * mounted-but-deciding step paints nothing here.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ConnectionIndicator,
  IconAgentPresetOutline16, IconArchiveOutline20, IconChevronLeftOutline14,
  IconCloseOutline16, IconDataOutline16, IconPersonalizationOutline16,
  IconQuestionOutline14, IconSettingsOutline16,
} from '@qilin/client-ui-primitives'
import type { ConnectionIndicatorState } from '@qilin/client-ui-primitives'
import type { SettingsRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import css from './SettingsRoot.module.css'
import { DesktopUpdateIndicator } from './DesktopUpdateIndicator.tsx'

const RECOVERY_CONFIRMATION_MS = 2_000

/** Minimum visible time for the connecting pill; shorter attempts read as flicker. */
const CONNECTING_MIN_VISIBLE_MS = 800

const SETTINGS_NAV_DEFAULT_WIDTH = 188
const SETTINGS_NAV_MIN_WIDTH = 160
const SETTINGS_NAV_MAX_WIDTH = 360

/** Keep a settings navigation width inside the usable rail range. */
function clampNavigationWidth(width: number): number {
  return Math.min(SETTINGS_NAV_MAX_WIDTH, Math.max(SETTINGS_NAV_MIN_WIDTH, Math.round(width)))
}

/** Pointer-resize control positioned on the settings navigation boundary. */
function SettingsNavResizeHandle({ label, width, onResize }: {
  label: string
  width: number
  onResize: (width: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const originWidth = useRef(width)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null)
  const currentWidth = useRef(width)
  currentWidth.current = width
  const resize = useRef(onResize)
  resize.current = onResize

  const endDrag = useCallback(() => {
    const active = capture.current
    if (active === null) return
    capture.current = null
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (typeof active.element.hasPointerCapture === 'function'
      && active.element.hasPointerCapture(active.id)
      && typeof active.element.releasePointerCapture === 'function') {
      active.element.releasePointerCapture(active.id)
    }
    setDragging(false)
  }, [])

  useEffect(() => endDrag, [endDrag])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || capture.current !== null) return
    event.preventDefault()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    capture.current = { element: event.currentTarget, id: event.pointerId }
    origin.current = event.clientX
    originWidth.current = currentWidth.current
    latest.current = event.clientX
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== event.pointerId) return
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      resize.current(originWidth.current + latest.current - origin.current)
    })
  }, [])

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== event.pointerId) return
    resize.current(originWidth.current + event.clientX - origin.current)
    endDrag()
  }, [endDrag])

  const onPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id === event.pointerId) endDrag()
  }, [endDrag])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      className={css.resizeHandle}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  )
}

/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  if (id === 'models') return <IconDataOutline16 className={css.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={css.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={css.navIcon} size={16} />
  // 20-native glyph in the rail's 16px icon slot, as on the Session row menu.
  if (id === 'archived-sessions') return <IconArchiveOutline20 className={css.navIcon} size={16} />
  if (id === 'about') return <IconQuestionOutline14 className={css.navIcon} size={16} />
  return <IconSettingsOutline16 className={css.navIcon} size={16} />
}

type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsRootComponentProps['renderSlot']
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
  navWidth: number
  onNavResize: (width: number) => void
  resizeNavigationLabel: string
  backToWorkspaceLabel: string
}

/**
 * The settings page layer: a full-viewport surface holding the section rail
 * and a capped content column. Close paths: the header button, the mask that
 * the page covers, and document-level Escape (mounted only while open, so the
 * listener lifetime is the page's).
 */
function SettingsPanel({
  rows, renderSlot, activeId, onSelect, onClose, navWidth, onNavResize, resizeNavigationLabel,
  backToWorkspaceLabel,
}: PanelProps) {
  // Entries can unmount underneath the requested id, so the render-time
  // projection falls back to the first row when the id is gone.
  const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
  const aboutRow = rows.find(row => row.id === 'about')
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Entering the dialog focuses the close button; the root restores its trigger on close.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-labelledby={titleId}>
        <nav className={css.nav} style={{ width: navWidth }}>
          <div className={css.navTitle} id={titleId}>{renderSlot('settings.header', {})}</div>
          <div className={css.navList}>
            {rows.filter(row => row.id !== 'about').map(row => (
              <button
                key={row.id}
                type="button"
                className={clsx(css.navCell, row.id === active && css.active)}
                aria-current={row.id === active ? 'true' : undefined}
                onClick={() => { onSelect(row.id) }}
              >
                {navIcon(row.id)}
                <span className={css.navLabel}>{row.label}</span>
              </button>
            ))}
          </div>
          <div className={css.navSpacer} />
          {aboutRow !== undefined && (
            <button
              type="button"
              className={clsx(css.navCell, css.aboutNavCell, active === 'about' && css.active)}
              aria-current={active === 'about' ? 'true' : undefined}
              onClick={() => { onSelect('about') }}
            >
              {navIcon('about')}
              <span className={css.navLabel}>{aboutRow.label}</span>
            </button>
          )}
          <SettingsNavResizeHandle
            label={resizeNavigationLabel}
            width={navWidth}
            onResize={onNavResize}
          />
        </nav>
        <div className={css.content}>
          <div className={css.header}>
            <div className={css.actions}>{renderSlot('settings.action', {})}</div>
            <div className={css.headerRight}>
              <button type="button" className={css.returnButton} onClick={onClose}>
                <IconChevronLeftOutline14 size={14} />
                <span>{backToWorkspaceLabel}</span>
              </button>
              <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
                <IconCloseOutline16 size={14} />
                <span className={css.hiddenLabel}>{renderSlot('settings.close', {})}</span>
              </button>
            </div>
          </div>
          <div className={css.options}>
            {active !== undefined && (
              <section className={css.sectionCard} data-section-id={active}>
                {renderSlot('settings.section', { close: onClose }, { only: active })}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Render the settings panel and the closed-panel sidebar foot row.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export function SettingsRoot(props: SettingsRootComponentProps) {
  const {
    wide, reconnect, registerOpen, useConnectionState, useSections, useOnboardingSteps, useSessions,
    renderSlot, t, useDesktopUpdate, openDesktopUpdate,
  } = props
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [navWidth, setNavWidth] = useState(SETTINGS_NAV_DEFAULT_WIDTH)
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const [showRecovery, setShowRecovery] = useState(false)
  const [holdConnecting, setHoldConnecting] = useState(false)
  const connectingShownAt = useRef<number | undefined>(undefined)
  const close = useCallback(() => {
    setOpen(false)
    setActiveId(undefined)
  }, [])
  const openSection = useCallback((id: string) => {
    setActiveId(id)
    setOpen(true)
  }, [])
  // Publish this occupant's reveal action: ctx.settingsShell.open() reaches the
  // panel through it, and the panel keeps its state component-local.
  useEffect(() => registerOpen((sectionId) => {
    if (sectionId === undefined) {
      setOpen(true)
      return
    }
    openSection(sectionId)
  }), [registerOpen, openSection])

  // The ledger tick keeps the nav rows fresh: registrants re-register with
  // freshly localized text on locale change, and the header/close seats
  // re-render through their own outlets' subscriptions.
  const rows = useSections(s => s)
  const desktopUpdate = useDesktopUpdate(state => state)
  const connectionState = useConnectionState(state => state)
  const previousConnectionState = useRef(connectionState)
  const onboardingSteps = useOnboardingSteps(s => s)
  const onboardingActive = useSessions((state) => {
    const main = Object.values(state.byId)
      .find(session => (session.retainedBy.mainView ?? 0) > 0)
    return state.phase === 'ready' && (main === undefined || main.blank)
  })
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined

  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])

  useLayoutEffect(() => {
    const previous = previousConnectionState.current
    previousConnectionState.current = connectionState
    if (connectionState !== 'connected') {
      setShowRecovery(false)
      return
    }
    if (previous !== 'disconnected' && previous !== 'connecting') return
    setShowRecovery(true)
  }, [connectionState])

  // The confirmation window starts when the recovered pill becomes visible,
  // which the connecting minimum-visible hold can delay past the transition.
  useLayoutEffect(() => {
    if (!showRecovery || holdConnecting) return
    const timeout = window.setTimeout(() => { setShowRecovery(false) }, RECOVERY_CONFIRMATION_MS)
    return () => { window.clearTimeout(timeout) }
  }, [showRecovery, holdConnecting])

  useLayoutEffect(() => {
    if (connectionState === 'connecting') {
      connectingShownAt.current = Date.now()
      return
    }
    const shownAt = connectingShownAt.current
    if (shownAt === undefined) return
    connectingShownAt.current = undefined
    const remaining = CONNECTING_MIN_VISIBLE_MS - (Date.now() - shownAt)
    if (remaining <= 0) return
    setHoldConnecting(true)
    const timeout = window.setTimeout(() => { setHoldConnecting(false) }, remaining)
    return () => {
      window.clearTimeout(timeout)
      setHoldConnecting(false)
    }
  }, [connectionState])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])
  const onNavResize = useCallback((width: number) => {
    setNavWidth(clampNavigationWidth(width))
  }, [])

  let connectionIndicator: ConnectionIndicatorState | undefined
  if (connectionState === 'connecting' || holdConnecting) {
    connectionIndicator = 'connecting'
  } else if (connectionState === 'disconnected') {
    connectionIndicator = 'disconnected'
  } else if (showRecovery) {
    connectionIndicator = 'recovered'
  }

  // The foot row is the closed panel's only status seat, so it renders whenever
  // either the connection state or the desktop update has something to show.
  const updateActive = desktopUpdate.failed
    || (desktopUpdate.presentation !== undefined && desktopUpdate.presentation.phase !== 'idle')

  return (
    <>
      {wide && (connectionIndicator !== undefined || updateActive) && (
        <div className={css.connectionRow}>
          <ConnectionIndicator
            state={desktopUpdate.presentation?.phase === 'installing' ? undefined : connectionIndicator}
            disconnectedLabel={t('connection.error')}
            connectingLabel={t('connection.connecting')}
            recoveredLabel={t('connection.connected')}
            reconnectActionLabel={t('connection.reconnect')}
            restartActionLabel={t('connection.restart')}
            onReconnect={reconnect}
          />
          <DesktopUpdateIndicator wide={wide} hidden={connectionIndicator !== undefined && desktopUpdate.presentation?.phase !== 'installing'}
            t={t} view={desktopUpdate} onOpen={openDesktopUpdate} />
        </div>
      )}
      {open && (
        <SettingsPanel
          rows={rows}
          renderSlot={renderSlot}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={close}
          navWidth={navWidth}
          onNavResize={onNavResize}
          resizeNavigationLabel={t('resizeNavigation')}
          backToWorkspaceLabel={t('backToWorkspace')}
        />
      )}
      {/* Dialog chrome and `#root` inert ownership live inside each step's
          visible branch. A step still deciding (private facts loading)
          renders null, so nothing paints or blocks while it decides. */}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}
