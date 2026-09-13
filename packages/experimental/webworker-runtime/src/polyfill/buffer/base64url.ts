/**
 * Node's `base64url` encoding for the worker's Buffer. The bundled npm `buffer`
 * package (feross 6) implements `base64` alone, while Node has accepted
 * `base64url` since 15.7 and the image's own packages use it — accounts-local
 * keys its session cookies with it and stores its signing secret in it, and a
 * Session reference URI is one.
 *
 * The patch restates one alphabet in the other around the package's own
 * `base64` codec, so the bytes always come from the package and only the
 * spelling is this module's. `fill` and `alloc` reach it through `from`, which
 * is why the string boundary is patched rather than the individual codecs.
 * @module @qilin/experimental-webworker-runtime/src/polyfill/buffer/base64url
 */

/** The spelling the npm package decodes. */
const STANDARD_ENCODING = 'base64'

/** Node's URL-safe spelling of the same bytes. */
const URL_SAFE_ENCODING = 'base64url'

/** Whether one argument names Node's URL-safe base64 spelling. */
function isUrlSafe(encoding: unknown): boolean {
  return typeof encoding === 'string' && encoding.toLowerCase() === URL_SAFE_ENCODING
}

/**
 * Restate one URL-safe base64 string in the standard alphabet.
 * @param value - URL-safe base64, padded or not.
 * @returns the same bytes in the standard alphabet, padded to a codec boundary.
 */
export function toStandardAlphabet(value: string): string {
  const standard = value.replace(/-/gu, '+').replace(/_/gu, '/')
  return standard + '='.repeat((4 - (standard.length % 4)) % 4)
}

/**
 * Restate one standard-alphabet base64 string as Node's URL-safe spelling.
 * @param value - standard base64, padded or not.
 * @returns the same bytes in the URL-safe alphabet, without padding.
 */
export function toUrlSafeAlphabet(value: string): string {
  return value.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/**
 * The index of the encoding argument among one `write` call's trailing
 * parameters, or -1. The encoding travels last, after the buffer data, so a
 * written string that reads `base64url` is never mistaken for one.
 * @param args - the arguments after the written string.
 * @returns the index holding the encoding argument, or -1.
 */
function writeEncodingIndex(args: readonly unknown[]): number {
  for (let index = args.length - 1; index >= 1; index--) {
    if (isUrlSafe(args[index])) return index
  }
  return -1
}

/**
 * Add Node's `base64url` spelling to one Buffer implementation's string
 * boundary: `from`, `toString`, `write`, `byteLength`, and `isEncoding`.
 * @param Buffer - the class to patch in place, as the worker's `node:buffer`
 * shim installed it.
 */
export function installBase64UrlEncoding(Buffer: object): void {
  // The class's declared members carry narrow overloads and branded encoding
  // unions; the patch reaches the same properties as plain functions, which is
  // how the npm package assigns them.
  const target = Buffer as {
    from: (...args: unknown[]) => unknown
    isEncoding: (encoding: unknown) => boolean
    byteLength: (value: unknown, encoding?: unknown) => number
    prototype: {
      toString: (...args: unknown[]) => unknown
      write: (...args: unknown[]) => unknown
    }
  }
  const { from, isEncoding, byteLength } = target
  const instanceToString = target.prototype.toString
  const instanceWrite = target.prototype.write

  target.from = (...args: unknown[]) => {
    const [value, encoding] = args
    if (typeof value !== 'string' || !isUrlSafe(encoding)) return from(...args)
    return from(toStandardAlphabet(value), STANDARD_ENCODING)
  }
  target.prototype.toString = function patchedToString(this: unknown, ...args: unknown[]) {
    const [encoding, start, end] = args
    if (!isUrlSafe(encoding)) return instanceToString.apply(this, args)
    return toUrlSafeAlphabet(String(instanceToString.call(this, STANDARD_ENCODING, start, end)))
  }
  target.prototype.write = function patchedWrite(this: unknown, ...args: unknown[]) {
    const value = args[0]
    const at = writeEncodingIndex(args)
    if (typeof value !== 'string' || at === -1) return instanceWrite.apply(this, args)
    const restated = [...args]
    restated[0] = toStandardAlphabet(value)
    restated[at] = STANDARD_ENCODING
    return instanceWrite.apply(this, restated)
  }
  // A non-string value keeps its own byte count: the encoding argument names
  // how a string is spelled, and the package ignores it for everything else.
  target.byteLength = (value: unknown, encoding?: unknown) =>
    typeof value === 'string' && isUrlSafe(encoding)
      ? byteLength(toStandardAlphabet(value), STANDARD_ENCODING)
      : byteLength(value, encoding)
  target.isEncoding = (encoding: unknown) => isUrlSafe(encoding) || isEncoding(encoding)
}
