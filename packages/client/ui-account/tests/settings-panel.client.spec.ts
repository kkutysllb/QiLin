/** The account menu's live knowledge of whether the neighbouring settings panel is mounted. */
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanelPresence } from '../src/client/settings-panel.ts'

describe('SettingsPanelPresence', () => {
  it('starts absent until the panel publishes its open channel', () => {
    const presence = new SettingsPanelPresence()
    expect(presence.mounted.getSnapshot()).toBe(false)
  })

  it('notifies its readers once per real change and ignores a repeated publication', () => {
    const presence = new SettingsPanelPresence()
    const seen = vi.fn()
    presence.mounted.subscribe(seen)

    presence.publish(true)
    // A second mount effect publishing the same availability is a no-op, so the
    // Settings row does not re-render on it.
    presence.publish(true)
    expect(presence.mounted.getSnapshot()).toBe(true)
    expect(seen).toHaveBeenCalledOnce()

    // The same holds for a repeated absence.
    presence.publish(false)
    presence.publish(false)
    expect(presence.mounted.getSnapshot()).toBe(false)
    expect(seen).toHaveBeenCalledTimes(2)
  })
})
