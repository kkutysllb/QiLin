/**
 * The startup URL line every `qilin` profile app prints once it serves:
 * `<label>: <url>`.
 *
 * The label is a patchable row (`web-runtime.label`), so a product or
 * deployment layer replaces it: the shipped Web composition prints
 * `qilin web` and QiLin's own web profile prints `qilin`. Harnesses match the
 * line by the URL it carries, never by a product name.
 * @param output - combined stdout and stderr captured from the booted process.
 * @returns the served URL, or undefined while the app has not announced readiness.
 */
export function startupUrl(output: string): string | undefined {
  return /^[^\n]*?: (https?:\/\/\S+)/mu.exec(output)?.[1]
}
