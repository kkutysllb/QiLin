/**
 * The hero run-mode chip, beside the workspace picker on the new-task screen:
 * which preset the next task in this workbench tag composes from (D3). The
 * general and coding tags carry their own defaults (standard / ptc); the chip
 * exists so the creator preset stays one pick away. The choice is remembered
 * per tag through the workbench state, and the on-screen blank session is
 * rebound immediately so the staged task already carries it.
 *
 * The chip hides while the roster is unavailable, failed, or offers fewer
 * than two choices for the tag — a selector over one entry is noise.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { IconAgentPresetOutline16, IconChevronDownOutline14, Menu } from '@qilin/client-ui-primitives'
import type { AgentPresetChipProps } from './contract/slots.ts'
import css from './AgentPresetChip.module.css'

/**
 * Render the run-mode chip.
 * @param props - the bound workbench and roster selector hooks, the tag
 *   vocabulary and pick actions, and the locale seat.
 * @returns the chip, or null when there is nothing to choose.
 */
export function AgentPresetChip({ useWorkbench, useRoster, tagChoices, pick, t }: AgentPresetChipProps): ReactNode {
  const workbench = useWorkbench(snapshot => snapshot)
  const roster = useRoster(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const tag = workbench.active

  // Shipped presets keep the tag's own order; a preset neither tag's
  // vocabulary names (a user copy) shows under both tags and trails them.
  const options = useMemo(() => {
    const byId = new Map(roster.presets.map(preset => [preset.id, preset]))
    const shipped = tagChoices(tag)
      .map(id => byId.get(id))
      .filter(preset => preset !== undefined)
    const known = new Set([...tagChoices('general'), ...tagChoices('coding')])
    const custom = roster.presets.filter(preset => !known.has(preset.id))
    return [...shipped, ...custom]
  }, [roster.presets, tag, tagChoices])

  if (roster.status !== 'ready' || options.length < 2) return null
  const currentId = workbench.presets[tag]
  const currentName = options.find(option => option.id === currentId)?.name ?? currentId

  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={options.map(option => ({
        id: option.id,
        label: (
          <span className={css.item}>
            <span className={css.itemName}>{option.name ?? option.id}</span>
            {option.description !== undefined && (
              <span className={css.itemDesc}>{option.description}</span>
            )}
          </span>
        ),
      }))}
      selectedId={currentId}
      onSelect={(id) => {
        setOpen(false)
        pick(id)
      }}
      align="start"
      portal
      className={css.menuAnchor}
      anchor={(
        <button
          type="button"
          className={css.chip}
          aria-label={t('preset.aria')}
          aria-haspopup="menu"
          aria-expanded={open}
          title={t('preset.hint')}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconAgentPresetOutline16 className={css.icon} />
          <span className={css.label}>{currentName}</span>
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
}
