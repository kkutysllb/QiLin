/**
 * Credential scanning over one text. Each candidate is found by its published
 * literal and validated by bounded character runs; overlapping candidates join
 * the range that starts first, so no credential is ever drawn half masked.
 */
import {
  KEY_BLOCK_END_LITERAL, KEY_BLOCK_LABEL_MAX, KEY_BLOCK_LITERAL, KEY_BLOCK_MARKER, KEY_BLOCK_TAIL,
  PREFIXED_FORMATS, type CredentialRun, type PrefixedFormat, type RunCheck,
} from './credential-formats.ts'
import { maskKeyBlock, maskPrefixed, maskRange, type MaskBuilder } from './credential-masks.ts'

/** One recognized credential range, with the display form that masks it. */
export interface SecretRange {
  readonly start: number
  readonly end: number
  /** Display form of the original range; line breaks stay in place. */
  readonly masked: string
}

/** How a candidate's range is displayed. */
type Kind = 'key-block' | 'address' | 'prefixed'

/** One candidate range, before overlapping candidates are merged. */
interface Candidate {
  readonly start: number
  readonly end: number
  readonly kind: Kind
}

/** Mask builder per kind, exhaustive when a kind is added. */
const MASK_BUILDERS: Record<Kind, MaskBuilder> = {
  'key-block': maskKeyBlock,
  address: maskRange,
  prefixed: maskPrefixed,
}

/** Sticky run pattern per character class. */
const RUN_PATTERNS: Record<CredentialRun, RegExp> = {
  key: /[A-Za-z0-9_-]*/y,
  alnum: /[A-Za-z0-9]*/y,
  word: /\w*/y,
  alnumDash: /[A-Za-z0-9-]*/y,
  upperAlnum: /[A-Z0-9]*/y,
}

/** `\w` at one position. */
const WORD_RE = /[A-Za-z0-9_]/
/** Characters a private key header or footer label may carry. */
const LABEL_RE = /[A-Z0-9 ]/
/** `[^\d]*`, used to find the first digit after a `sk-` literal. */
const NON_DIGITS_RE = /[^\d]*/y
/** Private key header occurrences. */
const KEY_BLOCK_RE = new RegExp(KEY_BLOCK_LITERAL, 'g')
/**
 * `scheme://user:password@`; the capture is the password, the only part masked,
 * and the user name is bounded as an address parser bounds it.
 */
const ADDRESS_RE = /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s/:@?#]{0,256}:([^\s/@?#]+)@/g
/** Characters a `sk-` key may place between its literal and its first digit. */
const SK_DIGIT_WINDOW = 255
/** One literal and its own global pattern, per prefixed format. */
const LITERAL_PATTERNS: readonly (readonly [PrefixedFormat, RegExp])[] =
  PREFIXED_FORMATS.map(format => [format, new RegExp(format.literal, 'g')] as const)

/** One prefixed candidate under validation: the text, its format, and the run bounds. */
interface RunContext {
  readonly text: string
  readonly format: PrefixedFormat
  readonly start: number
  readonly end: number
}

/**
 * Offset after the run that sticky `pattern` matches at `start`.
 * @param pattern - sticky run pattern.
 * @param text - the text to measure.
 * @param start - offset the run starts at.
 * @returns offset after the run.
 */
function runEnd(pattern: RegExp, text: string, start: number): number {
  pattern.lastIndex = start
  pattern.test(text)
  return pattern.lastIndex
}

/**
 * Offset after the `-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----` header at
 * `start`, or -1 when the text there is not one.
 * @param text - the text to read.
 * @param start - offset the header body starts at.
 * @returns offset after the header, or -1.
 */
function headerEnd(text: string, start: number): number {
  const limit = Math.min(text.length, start + KEY_BLOCK_LABEL_MAX + KEY_BLOCK_MARKER.length + 1)
  let index = start
  while (index < limit && LABEL_RE.test(text[index] as string)) index++
  const tail = index - KEY_BLOCK_MARKER.length
  return tail >= start && index < limit && text.startsWith(KEY_BLOCK_TAIL, tail) ? tail + KEY_BLOCK_TAIL.length : -1
}

/**
 * Offset after the private key block at `at`, or -1 when its header is invalid.
 * An unterminated block reaches the end of the text: a key body must never escape
 * masking because its footer is missing.
 * @param text - the text to read.
 * @param at - offset of the `-----BEGIN ` literal.
 * @returns offset after the footer, or -1.
 */
function blockEnd(text: string, at: number): number {
  const header = headerEnd(text, at + KEY_BLOCK_LITERAL.length)
  if (header < 0) return -1
  for (let line = text.indexOf(KEY_BLOCK_END_LITERAL, header); line >= 0; line = text.indexOf(KEY_BLOCK_END_LITERAL, line + 1)) {
    const footer = headerEnd(text, line + KEY_BLOCK_END_LITERAL.length)
    if (footer >= 0) return footer
  }
  return text.length
}

/**
 * Offset after a JSON Web Token, whose header run heads two further runs joined
 * by `.eyJ` and `.`.
 * @param context - the header run and its format.
 * @returns offset after the signature run, or -1.
 */
function jwtEnd({ text, format, start, end }: RunContext): number {
  if (end - start > format.max || !text.startsWith('.eyJ', end)) return -1
  const payloadStart = end + '.eyJ'.length
  const payloadEnd = runEnd(RUN_PATTERNS.key, text, payloadStart)
  if (payloadEnd - payloadStart < format.min || text.charCodeAt(payloadEnd) !== 46) return -1
  const signatureEnd = runEnd(RUN_PATTERNS.key, text, payloadEnd + 1)
  return signatureEnd - (payloadEnd + 1) >= format.min ? signatureEnd : -1
}

/** Offset after a candidate per run check, exhaustive when a check is added. */
const RUN_CHECKS: Record<RunCheck, (context: RunContext) => number> = {
  run: context => context.end,
  bounded: context => context.end - context.start <= context.format.max && !WORD_RE.test(context.text[context.end] ?? '')
    ? context.end
    : -1,
  google: context => context.start + context.format.min,
  sk: (context) => {
    const digit = runEnd(NON_DIGITS_RE, context.text, context.start)
    return digit - context.start <= SK_DIGIT_WINDOW && digit < context.end ? context.end : -1
  },
  jwt: jwtEnd,
}

/**
 * Offset after the prefixed credential whose literal starts at `at`, or -1.
 * @param text - the text to read.
 * @param format - the literal's format.
 * @param at - offset of the literal.
 * @returns offset after the credential, or -1.
 */
function prefixedEnd(text: string, format: PrefixedFormat, at: number): number {
  if (at > 0 && WORD_RE.test(text[at - 1] as string)) return -1
  const start = at + format.literal.length
  const end = runEnd(RUN_PATTERNS[format.run], text, start)
  return end - start < format.min ? -1 : RUN_CHECKS[format.runCheck]({ text, format, start, end })
}

/**
 * Collect every password of an address that carries credentials.
 * @param text - the text to scan.
 * @param candidates - the candidate list to append to.
 */
function collectAddresses(text: string, candidates: Candidate[]): void {
  ADDRESS_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ADDRESS_RE.exec(text)) !== null) {
    const password = match[1] as string
    const end = match.index + match[0].length - 1
    candidates.push({ start: end - password.length, end, kind: 'address' })
  }
}

/**
 * Collect every private key block.
 * @param text - the text to scan.
 * @param candidates - the candidate list to append to.
 */
function collectKeyBlocks(text: string, candidates: Candidate[]): void {
  KEY_BLOCK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = KEY_BLOCK_RE.exec(text)) !== null) {
    const end = blockEnd(text, match.index)
    if (end < 0) continue
    candidates.push({ start: match.index, end, kind: 'key-block' })
    KEY_BLOCK_RE.lastIndex = end
  }
}

/**
 * Collect every prefixed credential, one literal pass per format.
 * @param text - the text to scan.
 * @param candidates - the candidate list to append to.
 */
function collectPrefixed(text: string, candidates: Candidate[]): void {
  for (const [format, pattern] of LITERAL_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const end = prefixedEnd(text, format, match.index)
      if (end > 0) candidates.push({ start: match.index, end, kind: 'prefixed' })
    }
  }
}

/**
 * Mask every candidate, merging overlapping ones into the range that starts
 * first, which keeps that range's mask.
 * @param text - the text the candidates were found in.
 * @param candidates - every candidate, in any order.
 * @returns the masked ranges in start order.
 */
function toRanges(text: string, candidates: readonly Candidate[]): readonly SecretRange[] {
  const ordered = [...candidates].sort((a, b) => a.start - b.start || a.end - b.end)
  const ranges: SecretRange[] = []
  let start = -1
  let end = -1
  let kind: Kind = 'prefixed'
  for (const candidate of ordered) {
    if (start >= 0 && candidate.start < end) {
      if (candidate.end > end) end = candidate.end
      continue
    }
    if (start >= 0) ranges.push({ start, end, masked: MASK_BUILDERS[kind](text, start, end) })
    start = candidate.start
    end = candidate.end
    kind = candidate.kind
  }
  if (start >= 0) ranges.push({ start, end, masked: MASK_BUILDERS[kind](text, start, end) })
  return ranges
}

/**
 * Every credential in `text`, in start order, each with the display form that
 * masks it.
 * @param text - the original user text.
 * @returns the masked ranges; empty when the text holds no recognized credential.
 */
export function scanSecrets(text: string): readonly SecretRange[] {
  const candidates: Candidate[] = []
  collectAddresses(text, candidates)
  collectKeyBlocks(text, candidates)
  collectPrefixed(text, candidates)
  return toRanges(text, candidates)
}
