/**
 * The user's switches over the right Sidebar's tab types.
 *
 * A switch is a browser-local preference, like the conversation's content
 * width: it says what this browser offers, not what the Session may hold, so
 * it never reaches the Host and never enters a Session log. The stored value
 * is the switched-off ids alone, which keeps a newly shipped type on by
 * default.
 *
 * A browser that refuses storage leaves the switches at their defaults and
 * loses them on the next load; nothing else can observe the difference, so
 * both directions swallow the failure.
 */

/** One storage key per browser, holding a JSON array of switched-off type ids. */
const DISABLED_KEY = 'qilin.sidebarRight.disabledTabs'

/**
 * The tab type ids the user has turned off.
 * @returns the ids, empty when nothing is stored or storage refuses to answer.
 */
export function readDisabledTabs(): readonly string[] {
  try {
    const raw = localStorage.getItem(DISABLED_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    // Reading storage and parsing its value are the only throwers, and both
    // mean the same thing: no usable list is stored, so every type stays on.
    return []
  }
}

/**
 * Store the ids the user has turned off.
 * @param ids - the switched-off ids.
 */
export function writeDisabledTabs(ids: readonly string[]): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify(ids))
  } catch {
    // Only the write throws (quota, or storage refused outright): the switches
    // keep working for this page and do not survive it.
  }
}
