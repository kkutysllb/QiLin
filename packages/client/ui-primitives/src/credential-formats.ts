/**
 * The credential formats the projection recognizes, as data: the ASCII literal
 * a candidate begins with, the character run that follows it, and how that run
 * validates. A value is recognized by its published format alone — provider key
 * and token prefixes, JSON Web Tokens, private key blocks, and the password of
 * an address that carries credentials — so free-form passwords and
 * `name=value` assignments stay plain.
 */

/** Character class of the run that follows a prefixed literal. */
export type CredentialRun = 'key' | 'alnum' | 'word' | 'alnumDash' | 'upperAlnum'

/** How a prefixed format validates the run that follows its literal. */
export type RunCheck = 'run' | 'bounded' | 'sk' | 'google' | 'jwt'

/** One recognized prefixed credential format. */
export interface PrefixedFormat {
  /**
   * ASCII literal the candidate begins with: no literal occurs inside another,
   * and none holds a regular-expression metacharacter.
   */
  readonly literal: string
  /** How the run after this literal validates. */
  readonly runCheck: RunCheck
  /** Character class of that run. */
  readonly run: CredentialRun
  /** Run length below which a candidate is not this format. */
  readonly min: number
  /** `bounded` only: longest accepted run. */
  readonly max: number
}

/** Literal that opens a private key header. */
export const KEY_BLOCK_LITERAL = '-----BEGIN '
/** PEM marker text that closes a private key header, before its dashes. */
export const KEY_BLOCK_MARKER = 'PRIVATE KEY'
/** Header tail from {@link KEY_BLOCK_MARKER} through its last dash. */
export const KEY_BLOCK_TAIL = KEY_BLOCK_MARKER + '-----'
/** Literal that opens a private key footer line. */
export const KEY_BLOCK_END_LITERAL = '-----END '
/** Longest label a private key header carries between its literal and tail. */
export const KEY_BLOCK_LABEL_MAX = 40

/**
 * Every prefixed format matches more than the eight characters a mask leaves
 * readable, so a near miss never exposes a whole value.
 */
export const PREFIXED_FORMATS: readonly PrefixedFormat[] = [
  // Model services: `sk-` keys carry a digit, which hyphenated identifiers rarely do.
  { literal: 'sk-', runCheck: 'sk', run: 'key', min: 20, max: 0 },
  { literal: 'AIza', runCheck: 'google', run: 'key', min: 35, max: 0 },
  // Code hosting and package registries.
  { literal: 'ghp_', runCheck: 'run', run: 'alnum', min: 36, max: 0 },
  { literal: 'gho_', runCheck: 'run', run: 'alnum', min: 36, max: 0 },
  { literal: 'ghu_', runCheck: 'run', run: 'alnum', min: 36, max: 0 },
  { literal: 'ghs_', runCheck: 'run', run: 'alnum', min: 36, max: 0 },
  { literal: 'ghr_', runCheck: 'run', run: 'alnum', min: 36, max: 0 },
  { literal: 'github_pat_', runCheck: 'run', run: 'word', min: 22, max: 0 },
  { literal: 'glpat-', runCheck: 'run', run: 'key', min: 20, max: 0 },
  { literal: 'npm_', runCheck: 'run', run: 'alnum', min: 36, max: 0 },
  { literal: 'hf_', runCheck: 'run', run: 'alnum', min: 30, max: 0 },
  // Cloud access key IDs.
  { literal: 'AKIA', runCheck: 'bounded', run: 'upperAlnum', min: 16, max: 16 },
  { literal: 'ASIA', runCheck: 'bounded', run: 'upperAlnum', min: 16, max: 16 },
  { literal: 'LTAI', runCheck: 'bounded', run: 'alnum', min: 12, max: 20 },
  { literal: 'AKID', runCheck: 'bounded', run: 'alnum', min: 28, max: 36 },
  // Collaboration and payment services.
  { literal: 'xoxa-', runCheck: 'run', run: 'alnumDash', min: 10, max: 0 },
  { literal: 'xoxb-', runCheck: 'run', run: 'alnumDash', min: 10, max: 0 },
  { literal: 'xoxp-', runCheck: 'run', run: 'alnumDash', min: 10, max: 0 },
  { literal: 'xoxr-', runCheck: 'run', run: 'alnumDash', min: 10, max: 0 },
  { literal: 'xoxs-', runCheck: 'run', run: 'alnumDash', min: 10, max: 0 },
  { literal: 'sk_live_', runCheck: 'run', run: 'alnum', min: 16, max: 0 },
  { literal: 'sk_test_', runCheck: 'run', run: 'alnum', min: 16, max: 0 },
  { literal: 'rk_live_', runCheck: 'run', run: 'alnum', min: 16, max: 0 },
  { literal: 'rk_test_', runCheck: 'run', run: 'alnum', min: 16, max: 0 },
  { literal: 'whsec_', runCheck: 'run', run: 'alnum', min: 24, max: 0 },
  // A JSON Web Token: its literal heads the header run.
  { literal: 'eyJ', runCheck: 'jwt', run: 'key', min: 8, max: 2048 },
]
