/**
 * Stream-mode compatibility layer between the LangGraph SDK and QiLin.
 *
 * The SDK 1.6.x `useLangGraph` hook auto-injects stream modes based on which
 * `on*Event` callbacks are registered (e.g. `onLangChainEvent` → `"events"`).
 * It also defaults `streamResumable` to `true` when a `runMetadataStorage`
 * is configured. QiLin does not support `"events"` or `stream_resumable: true`,
 * so both must be stripped before the request reaches the gateway — otherwise
 * the run is rejected with HTTP 422.
 *
 * The authoritative QiLin mode list lives in
 * `qilin/qilin/runtime/stream_modes.py` (`RunStreamMode` Literal).
 */
const SUPPORTED_RUN_STREAM_MODES = new Set<string>([
  "values",
  "messages-tuple",
  "updates",
  "debug",
  "tasks",
  "checkpoints",
  "custom",
]);

const warnedUnsupportedStreamModes = new Set<string>();

export function warnUnsupportedStreamModes(
  modes: string[],
  warn: (message: string) => void = console.warn,
) {
  const unseenModes = modes.filter((mode) => {
    if (warnedUnsupportedStreamModes.has(mode)) {
      return false;
    }
    warnedUnsupportedStreamModes.add(mode);
    return true;
  });

  if (unseenModes.length === 0) {
    return;
  }

  warn(
    `[kworks] Dropped unsupported LangGraph stream mode(s): ${unseenModes.join(", ")}`,
  );
}

/**
 * Sanitise a run-stream payload before it is sent to the QiLin gateway.
 *
 * Strips:
 * 1. Stream modes QiLin does not support (e.g. `"events"`, `"messages"`).
 * 2. `streamResumable: true` — QiLin only serves non-resumable streams.
 */
export function sanitizeRunStreamOptions<T>(options: T): T {
  if (
    typeof options !== "object" ||
    options === null
  ) {
    return options;
  }

  let result = options as Record<string, unknown>;

  // ── streamMode / stream_mode ──────────────────────────────────────────
  const streamModeKey = "streamMode" in result ? "streamMode" : null;
  const streamMode = streamModeKey ? result[streamModeKey] : undefined;

  if (streamMode != null) {
    const requestedModes = Array.isArray(streamMode)
      ? streamMode
      : [streamMode];
    const sanitizedModes = (requestedModes as string[]).filter((mode) =>
      SUPPORTED_RUN_STREAM_MODES.has(mode),
    );

    if (sanitizedModes.length < (requestedModes as string[]).length) {
      const droppedModes = (requestedModes as string[]).filter(
        (mode) => !SUPPORTED_RUN_STREAM_MODES.has(mode),
      );
      warnUnsupportedStreamModes(droppedModes);

      result = {
        ...result,
        [streamModeKey!]: Array.isArray(streamMode)
          ? sanitizedModes
          : (sanitizedModes[0] ?? "values"),
      };
    }
  }

  // ── streamResumable / stream_resumable ─────────────────────────────────
  // QiLin rejects `stream_resumable: true` with 422. Force it to false so
  // the SDK's default (which is `true` when runMetadataStorage is set) never
  // reaches the gateway.
  for (const key of ["streamResumable", "stream_resumable"]) {
    if (key in result && result[key] === true) {
      result = { ...result, [key]: false };
    }
  }

  return result as T;
}
