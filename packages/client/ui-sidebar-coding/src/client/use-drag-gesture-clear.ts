/** Shared by TabBar's strip and the split pane's leaf: both own drag gestures. */
import { useEffect } from 'react'

/**
 * Reset a drag gesture when the pointer releases outside the component:
 * `dragend`/`drop` (capture phase — a drop on another pane never reaches the
 * source's own handlers) and window `blur` all invoke `clear`.
 * @param clear - the gesture-state reset (the component's setState calls).
 */
export function useDragGestureClear(clear: () => void): void {
  useEffect(() => {
    window.addEventListener('dragend', clear, true)
    window.addEventListener('drop', clear, true)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('dragend', clear, true)
      window.removeEventListener('drop', clear, true)
      window.removeEventListener('blur', clear)
    }
  }, [clear])
}
