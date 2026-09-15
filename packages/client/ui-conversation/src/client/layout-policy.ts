/**
 * Conversation layout policy. It owns the live transcript content width and
 * carries the pre-durable browser preference forward, backed by the Host
 * user-settings document so the width the transcript renders at and the width
 * the General section shows are one fact.
 */
import { createSnapshotStore, type SnapshotStore } from '@qilin/client-store'
import type { SettingsScope } from '@qilin/client-ui-settings/client'
import {
  CONTENT_WIDTH_ADAPTIVE, CONTENT_WIDTH_FIELD, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN,
  DEFAULT_CONTENT_WIDTH,
} from '../conversation-settings.ts'
import type { ConversationSettings } from '../conversation-settings.ts'

/** Pre-durable storage key holding the dragged width in px. */
const LEGACY_WIDTH_KEY = 'qilin.conversation.contentWidth'

/**
 * Read and retire the pre-durable dragged width.
 * @returns the stored width in px, or null when unset, corrupt, or running without browser storage.
 */
function takeLegacyWidth(): number | null {
  /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(LEGACY_WIDTH_KEY)
  if (raw === null) return null
  localStorage.removeItem(LEGACY_WIDTH_KEY)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Clamp one requested width to a persistable integer preference. */
function toStoredWidth(px: number): number {
  if (px === CONTENT_WIDTH_ADAPTIVE) return CONTENT_WIDTH_ADAPTIVE
  return Math.min(Math.max(Math.round(px), CONTENT_WIDTH_MIN), CONTENT_WIDTH_MAX)
}

/** Whether the namespace carries an explicit user override for the width field. */
function widthOverridden(user: unknown): boolean {
  return typeof user === 'object'
    && user !== null
    && Object.hasOwn(user, CONTENT_WIDTH_FIELD)
}

/**
 * Content width shared by the resident Conversation shell and its Settings
 * row: one live store both read, backed by the Host user-settings document
 * when one is composed. `0` leaves the transcript to the layout's adaptive
 * clamp; any other value is an explicit width in px.
 */
export class ConversationLayoutPolicy {
  /** Reactive width source for the shell and the Settings row. */
  readonly contentWidth: SnapshotStore<number> = createSnapshotStore<number>(DEFAULT_CONTENT_WIDTH)
  private readonly host: SettingsScope<ConversationSettings> | undefined
  /** Width carried from pre-durable storage, awaiting its first Host view. */
  private pendingSeed: number | null = null

  /**
   * @param host - durable preference scope owned by the same plugin; absent
   * compositions stay process-local. The adoption subscription shares the
   * scope's plugin lifetime, so a disposed scope never publishes again.
   */
  constructor(host?: SettingsScope<ConversationSettings>) {
    this.host = host
    const legacy = takeLegacyWidth()
    if (legacy !== null) {
      this.contentWidth.set(toStoredWidth(legacy))
      this.pendingSeed = this.contentWidth.getSnapshot()
    }
    if (host !== undefined) {
      host.subscribe(() => { this.adopt(host) })
      this.adopt(host)
    }
  }

  /**
   * Change the transcript content width. The live value publishes before the
   * durable write starts. A drag yields a continuous, column-clamped request,
   * so the request is rounded and bounded here rather than rejected.
   * @param px - {@link CONTENT_WIDTH_ADAPTIVE} for the adaptive clamp, or a width in px.
   */
  setContentWidth(px: number): void {
    const next = toStoredWidth(px)
    // Any explicit choice supersedes a carried pre-durable width, including a
    // return to the adaptive clamp.
    this.pendingSeed = null
    const current = this.contentWidth.getSnapshot()
    if (current === next) return
    if (next === CONTENT_WIDTH_ADAPTIVE) void this.host?.unset(CONTENT_WIDTH_FIELD)
    else void this.host?.set(CONTENT_WIDTH_FIELD, next)
    this.contentWidth.set(next)
  }

  /**
   * Adopt the scope's accepted durable width without writing it back, unless
   * the carried pre-durable preference still awaits its first Host view.
   * @param host - the constructor-narrowed scope driving this adoption.
   */
  private adopt(host: SettingsScope<ConversationSettings>): void {
    const snapshot = host.getSnapshot()
    const section = snapshot.value
    if (section === undefined) return
    if (this.pendingSeed !== null) {
      const seed = this.pendingSeed
      this.pendingSeed = null
      if (!widthOverridden(snapshot.user)) {
        void host.set(CONTENT_WIDTH_FIELD, seed)
        return
      }
    }
    if (this.contentWidth.getSnapshot() === section.contentWidth) return
    this.contentWidth.set(section.contentWidth)
  }
}
