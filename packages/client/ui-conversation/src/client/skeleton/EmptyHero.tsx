// The composer remains in ConversationRoot so switching out of the blank-draft
// phase does not remount its textarea.

import { useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import {
  IconChevronDownOutline14, IconFolderClose16, IconFolderOpen16, QilinSeal,
} from '@qilin/client-ui-primitives'
import { workspaceTitleOf } from '@qilin/util-workspace-path'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationContentProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderClose16 className={css.folder} size={16} />
        : <IconFolderOpen16 className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Authorized renderer for the hero brand-mark slot. */
  renderSlot: ConversationContentProps['renderSlot']
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}

/** One greeting key of the hero locale seat. */
type HeroGreetingKey = 'hero.greeting.morning' | 'hero.greeting.afternoon' | 'hero.greeting.evening'

/**
 * Greeting key for one local hour.
 * @param hour - local hour in 0..23.
 * @returns the key naming that part of the day.
 */
function greetingKeyForHour(hour: number): HeroGreetingKey {
  if (hour < 12) return 'hero.greeting.morning'
  if (hour < 18) return 'hero.greeting.afternoon'
  return 'hero.greeting.evening'
}

/**
 * Render the hero chrome (brand mark, greeting, tagline; no composer, no
 * workspace row). The ambient wordmark behind the text is decoration: it carries
 * the product name at a size that reads as background rather than a second
 * headline, and it is hidden from the accessibility tree.
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ t, renderSlot, children }: HeroShellProps) {
  // Read once per mount: a greeting that rewrote itself mid-session would be a
  // clock reading, not a welcome.
  const [greeting] = useState(() => greetingKeyForHour(new Date().getHours()))
  return (
    <div className={css.root}>
      <div className={css.watermark} aria-hidden="true">{t('hero.headline')}</div>
      <div className={css.stack}>
        <div className={css.mark}>
          {renderSlot('conversation.hero.brand.mark', { size: 34 }, {
            fallback: <QilinSeal size={34} />,
          })}
        </div>
        <p className={css.greeting}>{t(greeting)}</p>
        <h1 className={css.tagline}>{t('hero.tagline')}</h1>
        <div className={css.body}>
          {/* The composer remains mounted outside this component. */}
        </div>
      </div>
      {children}
    </div>
  )
}
