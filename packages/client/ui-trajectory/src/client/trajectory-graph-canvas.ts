/**
 * Pure playback pacing and canvas-zoom arithmetic for the trajectory graph.
 *
 * The replay walks the ledger in the order the events actually happened,
 * pacing each hop by the recorded timestamps: the gap between two adjacent
 * records, clamped so a long tool call cannot freeze the replay and a burst
 * of records cannot blur past, then divided by the selected speed. The zoom
 * helpers keep the canvas point under the pointer fixed while the scale
 * changes. The module carries no React and no DOM.
 */

import type { TrajectoryTimelineStep } from './trajectory-graph.ts'

/** Recorded-gap clamp for one replay hop, in milliseconds. */
export const HOP_MIN_MS = 90

/** Upper bound of one replay hop's recorded gap, in milliseconds. */
export const HOP_MAX_MS = 1100

/** Replay speeds, in the order the speed button cycles them. */
export const REPLAY_SPEEDS: readonly number[] = [1, 2, 4]

/** Zoom bounds for the canvas scale. */
export const ZOOM_MIN = 0.4

/** Upper bound of the canvas scale. */
export const ZOOM_MAX = 2.4

/** Scale applied per wheel notch. */
export const ZOOM_WHEEL_STEP = 1.1

/**
 * Keep a value inside a closed range.
 * @param value - the number to confine.
 * @param min - the inclusive lower bound.
 * @param max - the inclusive upper bound.
 * @returns `value` when inside the range, otherwise the violated bound.
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * Replay pacing of one hop: the recorded gap to the previous record, clamped
 * and scaled by the replay speed.
 * @param timeline - the ledger-order walk with each record's timestamp.
 * @param index - the hop whose pacing to read.
 * @param speed - the replay speed divisor.
 * @returns The delay in milliseconds before the hop's record lights up.
 */
export function hopDelay(
  timeline: readonly TrajectoryTimelineStep[],
  index: number,
  speed: number,
): number {
  const at = timeline[index]?.at ?? 0
  const before = index === 0 ? at : timeline[index - 1]?.at ?? at
  return clamp(at - before, HOP_MIN_MS, HOP_MAX_MS) / speed
}

/**
 * The next speed in the cycle after the given one.
 * @param speed - the currently selected replay speed.
 * @returns The following entry of `REPLAY_SPEEDS`, wrapping to the first.
 */
export function nextSpeed(speed: number): number {
  const at = REPLAY_SPEEDS.indexOf(speed)
  return REPLAY_SPEEDS[(at + 1) % REPLAY_SPEEDS.length] ?? speed
}

/**
 * Multiplicative zoom step, clamped to the canvas bounds.
 * @param scale - the current scale.
 * @param factor - the growth factor; values below 1 shrink.
 * @returns The new scale inside `ZOOM_MIN`..`ZOOM_MAX`.
 */
export function zoomedBy(scale: number, factor: number): number {
  return clamp(scale * factor, ZOOM_MIN, ZOOM_MAX)
}

/**
 * The scroll offset that keeps one content point fixed while the scale
 * changes from `oldScale` to `newScale`.
 * @param offsetInViewport - distance from the scroller's leading edge to the anchor point.
 * @param scroll - the scroller's current scroll offset along the same axis.
 * @param oldScale - the scale the current scroll offset was measured at.
 * @param newScale - the scale to move to.
 * @returns The scroll offset that leaves the anchored content point under the same viewport position.
 */
export function anchoredScroll(
  offsetInViewport: number,
  scroll: number,
  oldScale: number,
  newScale: number,
): number {
  if (oldScale <= 0) return scroll
  const contentPoint = (scroll + offsetInViewport) / oldScale
  return contentPoint * newScale - offsetInViewport
}
