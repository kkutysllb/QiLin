export const STREAM_RENDER_THROTTLE_MS = 16;

/**
 * Detect a 409 Conflict from the backend when a thread already has an active
 * run. Busy submissions are queued by the page and must never auto-interrupt
 * the active run.
 */
export function isThreadBusyConflict(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }
  const status = Reflect.get(error, "status");
  if (status === 409 || status === "409") {
    return true;
  }
  const message = Reflect.get(error, "message");
  if (
    typeof message === "string" &&
    /409|conflict|already running|already (?:has|have) an active run/i.test(
      message,
    )
  ) {
    return true;
  }
  const detail = Reflect.get(error, "detail");
  if (
    typeof detail === "string" &&
    /already running|already (?:has|have) an active run|conflict/i.test(detail)
  ) {
    return true;
  }
  return false;
}
