/**
 * Presentation helpers for the trajectory graph's record inspector: the
 * ordered attachment rows (localized names and recorded metadata) and the
 * pretty-printed JSON the arguments disclosure renders.
 */

import { fileSizeText } from '@qilin-agent/client-ui-primitives'
import type { TrajectoryTranslate } from './locales.ts'
import type { TrajectoryAttachment } from './trajectory-graph.ts'

/** One inspector attachment row's resolved copy. */
export interface AttachmentPresentation {
  readonly kind: 'image' | 'file'
  /** Recorded name, or the localized ordinal/backup label. */
  readonly name: string
  /** One line of recorded metadata: size, media type, dimensions, offload marker. */
  readonly meta: string
}

/**
 * Resolve one attachment's display copy.
 * @param attachment - the recorded reference.
 * @param ordinal - one-based position among this record's attachments, for unnamed images.
 * @param t - namespace-bound translate for the backup and metadata labels.
 * @returns The row's kind, name, and metadata line (empty when nothing was recorded).
 */
export function attachmentPresentation(
  attachment: TrajectoryAttachment,
  ordinal: number,
  t: TrajectoryTranslate,
): AttachmentPresentation {
  const name = attachment.name !== undefined && attachment.name !== ''
    ? attachment.name
    : attachment.kind === 'image'
      ? t('attachment.imageName', { index: ordinal })
      : t('graph.attachment.file')
  const parts: string[] = []
  if (attachment.bytes !== undefined) parts.push(fileSizeText(attachment.bytes))
  if (attachment.mediaType !== undefined) parts.push(attachment.mediaType)
  if (attachment.width !== undefined && attachment.height !== undefined) {
    parts.push(`${attachment.width}×${attachment.height}`)
  }
  if (attachment.offloaded === true) parts.push(t('graph.attachment.offloaded'))
  return { kind: attachment.kind, name, meta: parts.join(' · ') }
}

/**
 * Pretty-print a JSON payload for the collapsible arguments disclosure.
 * @param raw - the recorded payload, verbatim.
 * @returns The payload re-printed with two-space indent, or the raw text when it is not JSON.
 */
export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
