/** Decorative occupant for the task-manager sidebar entry. */
import type { PropsRuntime } from '@qilin/client-ui-slots'
import type {} from '@qilin/client-ui-sidebar/client'

/**
 * Render the clock glyph at the size the sidebar asks for; the sidebar owns
 * its accessible navigation label. The glyph is the row's direct icon child,
 * as on every other panel row: an inline wrapper makes it the baseline of a
 * line box inside the row's glyph slot, which lifts it above the label. The
 * glyph declares itself decorative inline because the shared primitive's
 * plain icon set carries no implicit aria-hidden.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns decorative clock icon.
 */
export function TaskManagerIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="8" r="6.375" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 4.4V8.3L10.7 9.85" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
