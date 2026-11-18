import { useEffect, useRef, useState } from 'react'
import {
  IconChevronDownOutlineMedium, IconFolderOpenOutlineRegular, Menu, Tooltip, type MenuItem,
} from '@qilin-agent/client-ui-primitives'
import type { ObservableSnapshot } from '@qilin-agent/client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-ui-conversation/client'
import { NS, type OpenInAppKey } from './locales.ts'
import css from './OpenInAppAction.module.css'

/** Browser operations and state injected into the sidebar files contribution. */
export interface OpenInAppActionInjected {
  hooks: {
    openInAppApps: ObservableSnapshot<readonly string[] | null>
    openInAppChoice: ObservableSnapshot<string>
  }
  launch: (appId: string, path: string) => Promise<void>
  choose: (appId: string) => void
  iconUrl: (appId: string) => string
}

/** Browser operations and state shared by the sidebar Files action and the
 * document-control seats: both receive the session runtime share. */
export type OpenInAppActionProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<OpenInAppActionInjected>
  & { absolutePath?: string }

/**
 * Label keys per catalog id: the browser renders only ids it can name, so a
 * host catalog extension without a matching dictionary entry stays invisible
 * instead of showing a raw id.
 */
const APP_LABEL_KEY: Record<string, OpenInAppKey | undefined> = {
  finder: 'app.finder',
  explorer: 'app.explorer',
  filemanager: 'app.filemanager',
  cursor: 'app.cursor',
  vscode: 'app.vscode',
  vscodeinsiders: 'app.vscodeinsiders',
  windsurf: 'app.windsurf',
  zed: 'app.zed',
  sublimetext: 'app.sublimetext',
  xcode: 'app.xcode',
  androidstudio: 'app.androidstudio',
  intellij: 'app.intellij',
  pycharm: 'app.pycharm',
  webstorm: 'app.webstorm',
  phpstorm: 'app.phpstorm',
  goland: 'app.goland',
  rider: 'app.rider',
  rustrover: 'app.rustrover',
  fork: 'app.fork',
  sourcetree: 'app.sourcetree',
  github: 'app.github',
  tower: 'app.tower',
  gitkraken: 'app.gitkraken',
  smartgit: 'app.smartgit',
  sublimemerge: 'app.sublimemerge',
  ghostty: 'app.ghostty',
  warp: 'app.warp',
  iterm: 'app.iterm',
  kitty: 'app.kitty',
  terminal: 'app.terminal',
  windowsterminal: 'app.windowsterminal',
  gitbash: 'app.gitbash',
  gnometerminal: 'app.gnometerminal',
  konsole: 'app.konsole',
}

/** App ids whose icon image already failed this page; a 404 icon is fetched once, not per menu open. */
const failedIcons = new Set<string>()

/** Installed directory applications that reveal a path in the platform file manager. */
const FILE_MANAGER_APP_IDS = ['finder', 'explorer', 'filemanager'] as const

/**
 * One application's real bundle icon (host-served PNG) with an inline generic
 * app-square fallback while the host has none.
 * @param props - catalog id, host icon URL, and rendered size.
 * @returns the icon image or its fallback glyph.
 */
function AppIcon({ id, url, size }: { id: string; url: string; size: number }): React.JSX.Element {
  const [failed, setFailed] = useState(failedIcons.has(id))
  if (failed) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className={css.icon}
        aria-hidden
      >
        <rect x={3} y={3} width={18} height={18} rx={5} />
      </svg>
    )
  }
  return (
    <img
      src={url}
      width={size}
      height={size}
      className={css.icon}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => {
        failedIcons.add(id)
        setFailed(true)
      }}
    />
  )
}

/**
 * Quick launches settle well under this delay, so their busy dress never
 * paints — the visible dim-and-wait treatment is reserved for launches that
 * are actually taking a while, instead of flashing on every click.
 */
const BUSY_DRESS_DELAY_MS = 250

/**
 * Workspace-directory split button: the main button opens the session's
 * workspace directory in the remembered application, the chevron opens the
 * menu of every application the host probed as installed. It renders nothing
 * until the host reported at least one nameable application and the session
 * has a known workspace directory, so a host without the capability never
 * grows the control.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the split button and its menu, or null when there is nothing to offer.
 */
export function OpenInAppAction(props: OpenInAppActionProps): React.JSX.Element | null {
  const { sessionId, useSessions, useOpenInAppApps, useOpenInAppChoice, t } = props
  const cwd = props.absolutePath ?? useSessions(state => state.byId[sessionId]?.cwd)
  const available = useOpenInAppApps(apps => apps)
  const choice = useOpenInAppChoice(id => id)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'busy' | 'error'>('idle')
  const inFlight = useRef(false)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    clearTimeout(busyTimer.current)
    clearTimeout(errorTimer.current)
  }, [])

  // A null roster is still loading: the control keeps its place with a
  // skeleton so a narrow header does not jump when the names arrive.
  const loading = available === null
  const apps = (available ?? [])
    .map(id => ({ id, labelKey: APP_LABEL_KEY[id] }))
    .filter((entry): entry is { id: string; labelKey: OpenInAppKey } => entry.labelKey !== undefined)
  const currentEntry = apps.find(entry => entry.id === choice) ?? apps[0]
  if (cwd === undefined || cwd === '') return null
  if (!loading && currentEntry === undefined) return null

  const current = currentEntry?.id
  const currentLabel = currentEntry === undefined ? undefined : t(currentEntry.labelKey)
  const title = phase === 'error' ? t('open.error')
    : currentLabel === undefined ? t('path.appsLoading')
      : t('open.title', { app: currentLabel })
  const manager = (available ?? []).find(id => (FILE_MANAGER_APP_IDS as readonly string[]).includes(id))

  const launch = (appId: string): void => {
    if (inFlight.current) return
    inFlight.current = true
    // A pending error decay must not flip the button back to idle mid-launch.
    clearTimeout(errorTimer.current)
    clearTimeout(busyTimer.current)
    busyTimer.current = setTimeout(() => { setPhase('busy') }, BUSY_DRESS_DELAY_MS)
    props.launch(appId, cwd).then(() => {
      inFlight.current = false
      clearTimeout(busyTimer.current)
      setPhase('idle')
    }, () => {
      inFlight.current = false
      clearTimeout(busyTimer.current)
      setPhase('error')
      clearTimeout(errorTimer.current)
      errorTimer.current = setTimeout(() => { setPhase('idle') }, 2_000)
    })
  }

  const items: MenuItem[] = loading
    ? [{ id: 'loading', label: t('path.appsLoading'), disabled: true }]
    : apps.map(entry => ({
      id: entry.id,
      label: t(entry.labelKey),
      icon: <AppIcon id={entry.id} url={props.iconUrl(entry.id)} size={18} />,
    }))
  // The same reveal row every other opening menu carries; the directory itself
  // is what it shows, so the file-manager launch needs no association answer.
  const footer = manager === undefined ? undefined : [{
    id: 'reveal',
    label: t(manager === 'finder' ? 'menu.finder' : 'menu.reveal'),
    icon: <IconFolderOpenOutlineRegular size={14} />,
  }]

  return (
    <Menu
      open={open}
      align="end"
      dense
      portal
      selection="fill"
      listClassName={css.menu}
      onClose={() => { setOpen(false) }}
      items={items}
      {...(footer === undefined ? {} : { footer })}
      selectedId={current}
      onSelect={(id) => {
        setOpen(false)
        // A pick while a launch is in flight is ignored whole: persisting the
        // choice without launching would leave the button naming an app the
        // gesture never opened.
        if (inFlight.current) return
        if (id === 'reveal') {
          /* v8 ignore next -- the row exists only with an installed manager. */
          if (manager !== undefined) launch(manager)
          return
        }
        props.choose(id)
        launch(id)
      }}
      anchor={(
        <div className={css.split}>
          <Tooltip label={phase === 'error' ? t('open.error') : t('open.tooltip')} side="bottom">
            <button
              type="button"
              className={css.main}
              data-state={phase}
              disabled={loading || phase === 'busy'}
              aria-label={title}
              // The guard covers the skeleton: the button is disabled until a
              // nameable application arrives, so the fallback is unreachable.
              /* v8 ignore next */
              onClick={() => { if (current !== undefined) launch(current) }}
            >
              {current === undefined
                ? <span className={css.skeleton} data-open-in-app-skeleton aria-hidden="true" />
                : <AppIcon id={current} url={props.iconUrl(current)} size={15} />}
            </button>
          </Tooltip>
          <button
            type="button"
            className={css.chevron}
            aria-expanded={open}
            aria-haspopup="menu"
            title={t('menu.toggle')}
            aria-label={t('menu.toggle')}
            onClick={() => { setOpen(value => !value) }}
          >
            <IconChevronDownOutlineMedium size={11} />
          </button>
        </div>
      )}
    />
  )
}
