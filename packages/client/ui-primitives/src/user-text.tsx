/**
 * Display projection of reference forms in sent user text (bubble and queue
 * rows). The logged model text remains the single truth; this is presentation
 * only, and every part renders inline so a single-line message never breaks
 * across lines. Four decoration sources, by precedence: the wire session form
 * `@[label](qilin-session:...)` folds to its label; exact session labels
 * supplied by an adjacent recall decorate their bare `@label` mention; plain
 * `@name` word-boundary tokens decorate by shape alone; and a plain `/name`
 * token decorates only when the caller names it — a skill the host actually
 * loaded for that message (ui-chat reads the step's `skill-invocation`
 * injections) or the command a command-input bubble echoes — so `/123` or a
 * stray `/word` stays plain text. A `/name` token is whitespace-bounded like
 * the host skill gesture (`qilin-tool-skill`): it ends at whitespace or the
 * text end, so slash paths (`/nfs-hg/xxx`, `/plan.md`) and punctuation-glued
 * tokens (`/plan。`) stay plain even for a loaded name. A recognized credential
 * always draws masked, ahead of every reference decoration, and only the display
 * changes: the logged text, the copied text, and the model input keep the original
 * characters.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { SecretText } from './SecretText.tsx'
import { scanSecrets } from './credential-scanner.ts'
import { ReferenceIconRegular } from './ReferenceIcon.tsx'
import css from './user-text.module.css'
import markdownCss from './markdown/MarkdownText.module.css'

/** The wire form a session chip serializes to; label is the display text. */
const SESSION_WIRE_RE = /@\[([^\]\n]+)\]\(qilin-session:[^)\s]+\)/gu

/** Sentence punctuation a bare `@name` token may carry without being part of the reference. */
const TRAILING_PUNCTUATION_RE = /[.,;:!?，。；：！？]+$/u

/** One reference or slash-token decoration. */
interface DecorationRange {
  readonly start: number
  readonly end: number
  /** Matched source text (hover title). */
  readonly label: string
  readonly kind: 'session' | 'plain'
  /** Pre-resolved display text (wire folds); derived from label when absent. */
  readonly display?: string
}

/** One recognized credential: masked display without a reference chip. */
interface SecretDecoration {
  readonly start: number
  readonly end: number
  readonly kind: 'secret'
  /** Display form of the original range; line breaks stay in place. */
  readonly masked: string
}

/** One inline decoration over the text. */
type Range = DecorationRange | SecretDecoration

/** Optional navigation supplied by consumers that can preview references. */
export interface UserTextReferences {
  /** Open a file path decoded from an `@` mention. */
  openFile: (path: string) => void
  /** Open the source of a skill loaded for this message. */
  openSkill: (name: string) => void
}

/** Accessible names of the control that reveals one masked credential. */
export interface UserTextSecretLabels {
  /** Name while the value stays masked. */
  readonly reveal: string
  /** Name while the value is shown. */
  readonly hide: string
}

/**
 * Split one sent text into inline plain runs and reference chips.
 * @param text - the logged model text of the message or queue row.
 * @param sessionLabels - exact session mention labels associated by an adjacent recall.
 * @param slashNames - names a `/name` token may decorate as: the skills the
 * host loaded for this message, or the command a command bubble echoes
 * (unsent queue rows pass none).
 * @param slashKind - the chip kind those tokens render as.
 * @param references - optional file and skill preview actions; session and command tokens stay labels.
 * @param secretLabels - reveal-control copy for credentials; absent in text that stays masked.
 * @returns inline nodes covering the whole text.
 */
export function projectUserText(
  text: string,
  sessionLabels: readonly string[],
  slashNames: readonly string[] = [],
  slashKind: 'skill' | 'command' = 'skill',
  references?: UserTextReferences,
  secretLabels?: UserTextSecretLabels,
): ReactNode {
  const secrets = scanSecrets(text)
  const ranges: Range[] = secrets.map(secret => (
    { start: secret.start, end: secret.end, kind: 'secret', masked: secret.masked }
  ))
  // A credential outranks the reference decoration it shares text with: an
  // `@name` token whose name is itself a key must not render the key raw as a
  // chip label, and a wire session form carries its label in the same place.
  const maskedOver = (start: number, end: number): boolean =>
    secrets.some(secret => start < secret.end && secret.start < end)
  SESSION_WIRE_RE.lastIndex = 0
  let wire: RegExpExecArray | null
  while ((wire = SESSION_WIRE_RE.exec(text)) !== null) {
    if (maskedOver(wire.index, wire.index + wire[0].length)) continue
    ranges.push({
      start: wire.index,
      end: wire.index + wire[0].length,
      label: wire[0],
      kind: 'session',
      display: wire[1] as string, // non-optional capture in SESSION_WIRE_RE
    })
  }
  for (const rawLabel of [...new Set(sessionLabels)].sort((a, b) => b.length - a.length)) {
    const label = `@${rawLabel}`
    let start = text.indexOf(label)
    while (start >= 0) {
      if (!maskedOver(start, start + label.length)) {
        ranges.push({ start, end: start + label.length, label, kind: 'session' })
      }
      start = text.indexOf(label, start + label.length)
    }
  }
  // A `/` token ends at whitespace or the text end like the host skill
  // gesture; only `@` tokens shed sentence punctuation below.
  const re = /(^|\s)(\/[\w-]+(?=\s|$)|@"[^"\n]+"|@[^\s]+)/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tokenStart = m.index + (m[1] as string).length // (^|\s) captures '' at line start
    const rawLabel = m[2] as string // non-optional alternation capture
    const label = rawLabel.startsWith('@"')
      ? rawLabel
      : rawLabel.replace(TRAILING_PUNCTUATION_RE, '')
    if (label.length <= 1) continue
    if (label.startsWith('/') && !slashNames.includes(label.slice(1))) continue
    if (maskedOver(tokenStart, tokenStart + label.length)) continue
    ranges.push({ start: tokenStart, end: tokenStart + label.length, label, kind: 'plain' })
  }
  // A credential never starts where a reference token does, so a tie here is
  // always a session label against a slash token.
  const rankOf = (range: Range): number => range.kind === 'session' ? 0 : 1
  ranges.sort((a, b) => a.start - b.start || rankOf(a) - rankOf(b) || b.end - a.end)
  const parts: ReactNode[] = []
  let cursor = 0
  const pushPlain = (from: number, to: number): void => {
    parts.push(<span key={`t${from}`} className={css.plainRun}>{text.slice(from, to)}</span>)
  }
  for (const range of ranges) {
    if (range.start < cursor) continue
    const { start: tokenStart, end } = range
    if (tokenStart > cursor) pushPlain(cursor, tokenStart)
    if (range.kind === 'secret') {
      parts.push(<SecretText key={`sec${tokenStart}`} masked={range.masked} raw={text.slice(tokenStart, end)} labels={secretLabels} />)
      cursor = end
      continue
    }
    const { label, kind } = range
    const referenceKind = kind === 'session'
      ? 'session'
      : label.startsWith('@')
        ? label.replace(/^@"|"$/gu, '').endsWith('/') ? 'folder' : 'file'
        : undefined
    const displayLabel = range.display
      ?? (referenceKind === undefined
        ? label
        : referenceKind === 'session'
          ? label.slice(1)
          : label.slice(1).replace(/^"|"$/gu, '').split(/[\\/]/u).filter(Boolean).at(-1) ?? label.slice(1))
    const contents = <>
      {referenceKind !== undefined && (
        <ReferenceIconRegular kind={referenceKind} size={16} className={css.refIcon} />
      )}
      {displayLabel}
    </>
    const open = references === undefined ? undefined
      : referenceKind === 'file'
        ? () => { references.openFile(label.slice(1).replace(/^"|"$/gu, '')) }
        : referenceKind === undefined && slashKind === 'skill'
          ? () => { references.openSkill(label.slice(1)) }
          : undefined
    const className = clsx(css.refChip, referenceKind === undefined && css.slashChip)
    parts.push(open === undefined
      ? <span key={tokenStart} className={className} data-ref-chip={referenceKind ?? slashKind} title={label}>
        {contents}
      </span>
      : <button
        key={tokenStart}
        type="button"
        className={clsx(className, markdownCss.fileMention)}
        data-ref-chip={referenceKind ?? slashKind}
        title={label}
        onClick={(event) => {
          if (event.detail > 1 || (event.detail !== 0 && event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false)) return
          open()
        }}
      >
        {contents}
      </button>)
    cursor = end
  }
  if (parts.length === 0) return <span className={css.plainRun}>{text}</span>
  if (cursor < text.length) pushPlain(cursor, text.length)
  return <>{parts}</>
}
