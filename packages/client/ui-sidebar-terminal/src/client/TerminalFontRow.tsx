/** General Settings row for the terminal's font family and size. */
import { useState, type ReactNode } from 'react'
import { Input } from '@qilin/client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
import type { TerminalSettings } from '../terminal-settings.ts'
import { clampTerminalFontSize, DEFAULT_TERMINAL_FONT_FAMILY } from './terminal-font.ts'
import css from './TerminalFontRow.module.css'

/** Registration-side font preference. */
export interface TerminalFontRowInjected {
  hooks: {
    /** The stored preference, bound as useFont. */
    font: HostObservable<TerminalSettings>
  }
  /**
   * Change one stored font field; a write that cannot be persisted still
   * applies locally, so the choice stays usable.
   * @param patch - the fields to replace.
   */
  setFont: (patch: Partial<TerminalSettings>) => void
}

/** Full Settings-row props. */
export type TerminalFontRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'sidebarTerminal'>
  & InjectFace<TerminalFontRowInjected>

/**
 * Render the terminal font preference: a family the user may name, and the
 * size in CSS pixels. The stored preference is what the fields show; a field
 * carries a draft only while it is being edited, and commits it on blur or
 * Enter, so a half-typed value never reaches the terminal and a change made
 * elsewhere still shows through.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function TerminalFontRow({ useFont, setFont, t }: TerminalFontRowProps): ReactNode {
  const font = useFont(value => value)
  const [draftFamily, setDraftFamily] = useState<string | null>(null)
  const [draftSize, setDraftSize] = useState<string | null>(null)
  const commitFamily = (): void => {
    setFont({ fontFamily: (draftFamily ?? font.fontFamily).trim() })
    setDraftFamily(null)
  }
  const commitSize = (): void => {
    const requested = Number.parseInt(draftSize ?? String(font.fontSize), 10)
    setFont({ fontSize: Number.isFinite(requested) ? clampTerminalFontSize(requested) : font.fontSize })
    setDraftSize(null)
  }
  return (
    <div className={css.row} data-terminal-font-row>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.font.title')}</div>
        <div className={css.desc}>{t('settings.font.description')}</div>
      </div>
      <div className={css.fields}>
        <label className={css.field}>
          <span>{t('settings.font.family')}</span>
          <Input
            className={css.family}
            value={draftFamily ?? font.fontFamily}
            placeholder={DEFAULT_TERMINAL_FONT_FAMILY}
            aria-label={t('settings.font.family')}
            onChange={(event) => { setDraftFamily(event.target.value) }}
            onBlur={commitFamily}
            onKeyDown={(event) => { if (event.key === 'Enter') commitFamily() }}
          />
        </label>
        <label className={css.field}>
          <span>{t('settings.font.size')}</span>
          <Input
            className={css.size}
            value={draftSize ?? String(font.fontSize)}
            inputMode="numeric"
            aria-label={t('settings.font.size')}
            onChange={(event) => { setDraftSize(event.target.value) }}
            onBlur={commitSize}
            onKeyDown={(event) => { if (event.key === 'Enter') commitSize() }}
          />
        </label>
      </div>
    </div>
  )
}
