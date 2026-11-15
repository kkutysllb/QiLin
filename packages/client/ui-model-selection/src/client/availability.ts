/** Global model availability over the Host-reported catalog. */

import { createSnapshotStore, type SnapshotStore } from '@qilin-agent/client-store'

/** Storage key holding the disabled provider/model pairs. */
export const MODEL_AVAILABILITY_STORAGE_KEY = 'qilin.model-selection.disabled.v1'

/** The separator keeps provider and model ids from colliding across pairs. */
const PAIR_SEPARATOR = '\u0000'

/** The subset of Web Storage this preference needs. */
export interface ModelAvailabilityStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * One provider/model pair in the persisted disabled set.
 * @param provider - provider route id.
 * @param model - provider-owned model id.
 * @returns the opaque pair key stored in local storage.
 */
export function modelAvailabilityKey(provider: string, model: string): string {
  return `${provider}${PAIR_SEPARATOR}${model}`
}

/** Use the document's storage when the environment provides one. */
function defaultStorage(): ModelAvailabilityStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    // Storage can be unavailable under a restricted browser policy. The page
    // still works for this document; only reload persistence is lost.
    return undefined
  }
}

/** Read a persisted disabled set, ignoring malformed or untrusted entries. */
function readDisabled(storage: ModelAvailabilityStorage | undefined): readonly string[] {
  if (storage === undefined) return []
  let raw: string | null
  try {
    raw = storage.getItem(MODEL_AVAILABILITY_STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
}

/**
 * The disabled provider/model set shared by the model manager and every model
 * selector. A missing entry is enabled: deployments start with their complete
 * advertised catalog. The source stays stable until a user toggles a card or
 * another document writes the storage key.
 */
export class ModelAvailability {
  /** Persisted pair keys, sorted for a stable snapshot identity. */
  readonly store: SnapshotStore<readonly string[]> = createSnapshotStore<readonly string[]>([])

  private readonly storage: ModelAvailabilityStorage | undefined

  /**
   * @param storage - storage backend; defaults to the document's localStorage.
   *   Tests pass an in-memory backend.
   */
  constructor(storage: ModelAvailabilityStorage | undefined = defaultStorage()) {
    this.storage = storage
    this.store.set(readDisabled(storage))
  }

  /**
   * Whether one advertised model may appear in a selector.
   * @param provider - provider route id.
   * @param model - provider-owned model id.
   * @returns false only when the user switched this exact pair off.
   */
  has(provider: string, model: string): boolean {
    return !this.store.getSnapshot().includes(modelAvailabilityKey(provider, model))
  }

  /**
   * Switch one advertised model on or off and persist the complete set.
   * @param provider - provider route id.
   * @param model - provider-owned model id.
   * @param enabled - true restores the model to selectors; false hides it.
   */
  setEnabled(provider: string, model: string, enabled: boolean): void {
    const key = modelAvailabilityKey(provider, model)
    const next = new Set(this.store.getSnapshot())
    if (enabled) next.delete(key)
    else next.add(key)
    const values = [...next].sort()
    this.store.set(values)
    try {
      this.storage?.setItem(MODEL_AVAILABILITY_STORAGE_KEY, JSON.stringify(values))
    } catch {
      // A full or restricted storage area loses reload persistence, not the
      // in-memory switch the user just made.
    }
  }

  /**
   * Follow writes from other documents on the same origin.
   * @returns the listener disposer.
   */
  attach(): () => void {
    if (typeof window === 'undefined') return () => {}
    const listener = (event: StorageEvent): void => {
      if (event.key === MODEL_AVAILABILITY_STORAGE_KEY) this.store.set(readDisabled(this.storage))
    }
    window.addEventListener('storage', listener)
    return () => { window.removeEventListener('storage', listener) }
  }
}
