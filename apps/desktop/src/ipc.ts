/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@qilin-agent/client-shortcuts/protocol'
import type { IpcMainInvokeEvent } from 'electron'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  shortcutsInput: 'qilin-desktop:shortcuts-input',
  shortcutsCloseWindow: 'qilin-desktop:shortcuts-close-window',
  shortcutsGet: 'qilin-desktop:shortcuts-get',
  shortcutsEdit: 'qilin-desktop:shortcuts-edit',
  shortcutsChanged: 'qilin-desktop:shortcuts-changed',
  shortcutsRecording: 'qilin-desktop:shortcuts-recording',
  boot: 'qilin-desktop:boot',
  enterWorkspace: 'qilin-desktop:enter-workspace',
  onboardingActive: 'qilin-desktop:onboarding-active',
  onboardingApiKey: 'qilin-desktop:onboarding-api-key',
  bootFailed: 'qilin-desktop:boot-failed',
  browserAcquire: 'qilin-desktop:browser-acquire',
  browserRelease: 'qilin-desktop:browser-release',
  browserOpenRequested: 'qilin-desktop:browser-open-requested',
  directoryPick: 'qilin-desktop:directory-pick',
  deviceInfo: 'qilin-desktop:device-info',
  localeBootstrap: 'qilin-desktop:locale-bootstrap',
  localeChanged: 'qilin-desktop:locale-changed',
  updatesStatus: 'qilin-desktop:updates-status',
  updatesOpen: 'qilin-desktop:updates-open',
  updatesPresentation: 'qilin-desktop:updates-presentation',
  nativeThemeSet: 'qilin-desktop:native-theme-set',
  windowFullscreen: 'qilin-desktop:window-fullscreen',
  windowZoom: 'qilin-desktop:window-zoom',
  windowsAppearance: 'qilin-desktop:windows-appearance',
  windowsMenu: 'qilin-desktop:windows-menu',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable'

export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
  /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
  readonly technicalDetails?: string
  readonly percent?: number
  readonly failedOperation?: 'check' | 'download' | 'install'
  /** Main-owned preparation cause; UI wording is selected by the active locale. */
  readonly preparationFailure?: DesktopUpdatePreparationFailureKind
}

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'

/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
  readonly phase: DesktopUpdateState['phase']
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
}

/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface QilinDesktopProductApi {
  readonly protocolVersion: 1
  readonly keyboard: DesktopKeyboardApi
  readonly shortcuts: DesktopShortcutsApi
  /**
   * Local machine description for the feedback questionnaire.
   * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
   */
  deviceInfo(): Promise<string>
  /**
   * Toggle the product window between zoomed and its restored frame. A product
   * whose chrome owns the whole title band cannot rely on a native title bar,
   * so its double click asks here instead.
   * @returns whether the window is zoomed after the call.
   */
  toggleWindowZoom(): Promise<boolean>
  readonly updates: {
    status(): Promise<DesktopUpdatePresentation>
    open(): Promise<void>
    subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
  }
}

/** Scheme of Desktop-owned application documents; the product manifest may name another. */
export const SCHEME = 'qilin-app'

/** Argument the main process uses to tell a preload which application scheme it serves. */
export const SCHEME_ARGUMENT = '--qilin-desktop-scheme='

/**
 * Application scheme this process serves.
 *
 * The main process passes the product scheme through `additionalArguments`; a preload reads
 * it from `process.argv`. Without the argument the engine's own scheme applies.
 * @param argv - process arguments; defaults to this process's.
 * @returns The scheme without the trailing colon.
 */
export function desktopScheme(argv: readonly string[] = process.argv): string {
  const entry = argv.find(argument => argument.startsWith(SCHEME_ARGUMENT))
  const fromArgument = entry === undefined ? '' : entry.slice(SCHEME_ARGUMENT.length)
  const fromEnvironment = process.env.QILIN_DESKTOP_SCHEME ?? ''
  for (const candidate of [fromArgument, fromEnvironment]) {
    if (/^[a-z][a-z0-9+.-]*$/u.test(candidate)) return candidate
  }
  return SCHEME
}

/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 * @param scheme - Application scheme the product serves.
 */
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[], scheme: string = desktopScheme()): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('qilin desktop: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${scheme}:` || !hostnames.includes(url.hostname)) {
    throw new Error('qilin desktop: rejected IPC from an unowned renderer')
  }
}
