import clsx from 'clsx'
import css from './StateDot.module.css'

/**
 * State semantic: green done / amber user-attention / blue running ring /
 * red error / grey idle for a tracked subject with nothing in progress.
 */
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'

/**
 * Pin the loader's CSS animations to document time zero. A CSS animation starts
 * when its element is inserted and restarts when the element is moved or shown
 * again, so loaders started at different moments animate out of phase; one shared
 * start time keeps every visible loader in step. Mount pins the first start; the
 * element's own `animationstart` listener pins each restart.
 * @param element - the mounted loader, or null on unmount.
 */
function syncSpinner(element: SVGSVGElement | null): void {
  if (element === null) return
  pinSpinner(element)
  element.addEventListener('animationstart', () => { pinSpinner(element) })
}

/**
 * Set every CSS animation in the loader's subtree to start at document time zero.
 * @param element - the mounted loader.
 */
function pinSpinner(element: SVGSVGElement): void {
  // jsdom (the unit lane) implements no Web Animations despite lib.dom's
  // non-optional typing; the optional call leaves that lane unsynced.
  const spinner = element as { getAnimations?: SVGSVGElement['getAnimations'] }
  for (const animation of spinner.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0
}
/** Outer 3x3 matrix cells (2px pixels on a 10px grid), clockwise from top-left. */
const MATRIX_CELLS: readonly (readonly [number, number])[] = [
  [0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4],
]

/**
 * Render a state dot.
 * @param props.state - which of `done`, `warning`, `ongoing`, `error`, or `idle` to show.
 * @param props.size - outer diameter in px (default 10, the figma size).
 * @param props.className - extra class for layout placement.
 * @returns the dot element (aria-hidden; pair with text for accessibility).
 */
export function StateDot({ state, size = 10, className }: {
  state: StateDotState
  size?: number | undefined
  className?: string | undefined
}) {
  if (state === 'ongoing') {
    return (
      <svg
        ref={syncSpinner}
        className={clsx(css.matrix, className)}
        data-state="ongoing"
        width={size}
        height={size}
        viewBox="0 0 10 10"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {MATRIX_CELLS.map(([x, y], index) => (
          <rect
            key={`${x}-${y}`}
            className={css.cell}
            x={x}
            y={y}
            width="2"
            height="2"
            /* Negative delay phases the chase so every cell animates from mount. */
            style={{ animationDelay: `${(index - MATRIX_CELLS.length) * 125}ms` }}
          />
        ))}
      </svg>
    )
  }
  return (
    <span
      className={clsx(css.dot, className)}
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
