/**
 * The document preview's file-opening entries: the header control, and the
 * labeled form an unpreviewable file's empty state shows. Both hand the file's
 * Host path to the Session Remote, which re-verifies it before running any
 * native command, and both list the file's registered handlers beside the file
 * manager's reveal. A Host without a desktop opener renders nothing at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronDownOutline14, IconFolderOpenOutline16, IconRightUpOutline16, Menu, Tooltip,
} from '@qilin-agent/client-ui-primitives'
import type { MenuEntry } from '@qilin-agent/client-ui-primitives'
import type { ObservableSnapshot } from '@qilin-agent/client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type { SessionWorkspacePathApplication } from '@qilin-agent/api-session-controller/types'
import type {} from '@qilin-agent/client-ui-sidebar-documentpreview/client'
import { NS } from './locales.ts'
import type { OpenInAppPathAction, OpenInAppPathFailure } from './open-path.ts'
import css from './OpenPathAction.module.css'

/** Desktop availability and file gestures injected into both document-seat contributions. */
export interface OpenPathInjected {
  hooks: {
    /** Whether the Host can hand a path to a native application; null until it answered. */
    openInAppDesktop: ObservableSnapshot<boolean | null>
  }
  /** Read desktop availability once per page; concurrent calls share the read. */
  loadDesktop: () => Promise<void>
  /** Registered handlers for one file, or null when the query failed. */
  applications: (path: string, signal: AbortSignal) => Promise<readonly SessionWorkspacePathApplication[] | null>
  /** Open or reveal one Host path; the failure to announce, or null once acknowledged. */
  openPath: (path: string, action: OpenInAppPathAction, application?: string) => Promise<OpenInAppPathFailure | null>
}

/** Composed props of the document header's file-opening entry. */
export type OpenPathActionProps =
  PropsRuntime<'sidebar.right.tab.document.actions'>
  & PropsLocale<typeof NS>
  & InjectFace<OpenPathInjected>

/** Composed props of the unpreviewable empty state's file-opening entry. */
export type OpenPathEmptyActionProps =
  PropsRuntime<'sidebar.right.tab.document.unpreviewable'>
  & PropsLocale<typeof NS>
  & InjectFace<OpenPathInjected>

/** How far the handler query for this file has come; null before the menu is opened. */
type HandlerState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly apps: readonly SessionWorkspacePathApplication[] }
  | { readonly status: 'failed' }

/** One application's icon, with the generic external-open glyph when the Host serves none. */
function ApplicationIcon({ source, size }: { source: string | null; size: number }): ReactNode {
  const [failed, setFailed] = useState(false)
  return source === null || failed
    ? <IconRightUpOutline16 size={size} />
    : (
      <img
        src={source}
        width={size}
        height={size}
        className={css.appIcon}
        alt=""
        draggable={false}
        onError={() => { setFailed(true) }}
      />
    )
}

/**
 * One file's opening control: the main button opens it in the default
 * application, the chevron lists the registered handlers and the file
 * manager's reveal. A gesture in flight blocks the next one whole.
 * @param props - the file's Host path, the injected opening face, and copy.
 * @returns the split control, or null without a Host desktop to open on.
 */
function FileOpenTarget({
  absolutePath, useOpenInAppDesktop, loadDesktop, applications, openPath, t, prominent = false,
}: OpenPathActionProps & { readonly prominent?: boolean }): ReactNode {
  const desktop = useOpenInAppDesktop(value => value)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<OpenInAppPathFailure | null>(null)
  const [handlers, setHandlers] = useState<HandlerState | null>(null)
  const querying = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  useEffect(() => {
    if (desktop === null) void loadDesktop()
  }, [desktop, loadDesktop])
  const loadApplications = useCallback((): void => {
    if (querying.current !== null) return
    const controller = new AbortController()
    querying.current = controller
    setHandlers({ status: 'loading' })
    void applications(absolutePath, controller.signal).then((apps) => {
      if (controller.signal.aborted) return
      setHandlers(apps === null ? { status: 'failed' } : { status: 'ready', apps })
    })
  }, [absolutePath, applications])
  // A later file under the same control starts its own query and drops the old one.
  useEffect(() => () => { querying.current?.abort() }, [absolutePath])
  const run = (action: OpenInAppPathAction, application?: string): void => {
    setOpen(false)
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setFailure(null)
    void openPath(absolutePath, action, application).then((result) => {
      inFlight.current = false
      setPending(false)
      setFailure(result)
    })
  }
  if (desktop !== true) return null
  const label = failure === null ? t('path.open') : t(`path.${failure}`)
  const entries: MenuEntry[] = handlers?.status === 'ready'
    ? handlers.apps.map(app => ({
      id: `app:${app.id}`,
      label: app.default ? t('path.appDefault', { app: app.name }) : app.name,
      icon: <ApplicationIcon source={app.icon} size={14} />,
    }))
    : handlers?.status === 'loading'
      ? [{ id: 'loading', label: t('path.appsLoading'), disabled: true }]
      : handlers?.status === 'failed'
        ? [{ id: 'unavailable', label: t('path.appsError'), disabled: true }]
        : []
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      onClose={() => { setOpen(false) }}
      items={entries}
      footer={[{ id: 'reveal', label: t('path.reveal'), icon: <IconFolderOpenOutline16 size={14} /> }]}
      onSelect={(id) => { run(id === 'reveal' ? 'reveal' : 'open', id === 'reveal' ? undefined : id.slice(4)) }}
      anchor={(
        <div
          className={css.split}
          data-size={prominent ? 'large' : 'compact'}
          data-state={pending ? 'busy' : failure === null ? 'idle' : 'error'}
          data-open-path-open={prominent ? undefined : ''}
          data-open-path-unpreviewable={prominent ? '' : undefined}
        >
          <Tooltip label={label} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.main}
              disabled={pending}
              aria-label={label}
              onClick={() => { run('open') }}
            >
              <IconRightUpOutline16 size={prominent ? 16 : 14} />
              {prominent && <span className={css.label}>{t('path.open')}</span>}
            </button>
          </Tooltip>
          <button
            type="button"
            className={css.chevron}
            disabled={pending}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t('path.more')}
            data-open-path-more={prominent ? undefined : ''}
            onClick={() => {
              if (!open) loadApplications()
              setOpen(value => !value)
            }}
          >
            <IconChevronDownOutline14 size={prominent ? 14 : 11} />
          </button>
        </div>
      )}
    />
  )
}

/**
 * Render the file opening entry in the document header.
 * @param props - document owner inputs and injected opening capabilities.
 * @returns the compact split control, or null without a Host desktop.
 */
export function OpenPathAction(props: OpenPathActionProps): ReactNode {
  return <FileOpenTarget {...props} />
}

/**
 * Render the file opening entry in an unpreviewable document's empty state.
 * @param props - document owner inputs and injected opening capabilities.
 * @returns the labeled split control, or null without a Host desktop.
 */
export function OpenPathEmptyAction(props: OpenPathEmptyActionProps): ReactNode {
  return <FileOpenTarget {...props} prominent />
}
