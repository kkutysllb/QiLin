/** Decorative running mark for the Chat status: the QiLin seal, gently breathing. */
import { QilinSeal } from '@qilin-agent/client-ui-primitives'
import css from './ChatView.module.css'

/**
 * Render the decorative running icon.
 * @returns the seal svg breathing at the running label's left.
 */
export function RunningSeal() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <QilinSeal size={14} className={css.runningSeal} />
    </span>
  )
}
