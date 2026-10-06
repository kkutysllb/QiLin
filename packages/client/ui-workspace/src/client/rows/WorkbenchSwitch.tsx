/**
 * The dual-workbench switch: the active tag renders as an outlined pill with
 * icon and label, the inactive tag collapses to an icon-only button. Visual
 * order is constant (coding left, general right); the pill and icon roles
 * swap with the active tag.
 */
import type { KeyboardEvent, ReactNode } from 'react'
import clsx from 'clsx'
import { IconSparkle16, IconTerminalOutline16 } from '@qilin/client-ui-primitives'
import type { WorkbenchTag } from '@qilin/client-ui-workbench/client'
import css from './WorkbenchSwitch.module.css'

/** Constant visual order: coding first (left), general second (right). */
const ENTRIES: readonly WorkbenchTag[] = ['coding', 'general']

/**
 * Render the two-tag switch. Both tags stay mounted and reachable — only the
 * label of the inactive one is hidden — so the tab semantics of the previous
 * segmented control carry over: roving tab stop on the selected tag,
 * Left/Right to move selection.
 * @param props.value - the active tag.
 * @param props.onChange - selection requested by click or Left/Right.
 * @param props.labels - localized tag names, keyed by tag; the inactive
 * button's accessible name (its label is hidden).
 * @param props.ariaLabel - localized accessible name for the tab list.
 * @param props.panelId - DOM id of the panel the tabs control.
 * @returns the tab list, without its panel.
 */
export function WorkbenchSwitch({ value, onChange, labels, ariaLabel, panelId }: {
  value: WorkbenchTag
  onChange: (tag: WorkbenchTag) => void
  labels: Readonly<Record<WorkbenchTag, string>>
  ariaLabel: string
  panelId: string
}): ReactNode {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = (index + ENTRIES.length - 1) % ENTRIES.length; break
      case 'ArrowRight': next = (index + 1) % ENTRIES.length; break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    const tablist = event.currentTarget.parentElement
    const nextTag = ENTRIES[next]
    /* v8 ignore next -- the event comes from a mounted direct child and next is bounded by the fixed pair. */
    if (tablist === null || nextTag === undefined) return
    tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus()
    onChange(nextTag)
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={css.switch}>
      {ENTRIES.map((tag, index) => {
        const active = value === tag
        return (
          <button
            key={tag}
            type="button"
            role="tab"
            id={`workbench-tab-${tag}`}
            aria-selected={active}
            aria-controls={panelId}
            aria-label={labels[tag]}
            tabIndex={active ? 0 : -1}
            title={labels[tag]}
            className={clsx(css.tab, active ? css.activePill : css.inactiveIcon)}
            onClick={() => { onChange(tag) }}
            onKeyDown={(event) => { onKeyDown(event, index) }}
          >
            {tag === 'coding' ? <IconTerminalOutline16 size={14} /> : <IconSparkle16 size={14} />}
            {active && <span className={css.label}>{labels[tag]}</span>}
          </button>
        )
      })}
    </div>
  )
}
