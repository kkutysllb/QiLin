/** V7 framing reusing the released V6 physical rows and admission. */

import { SessionFormatError, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatHeader } from '@qilin-agent/session-format'
import { releasedV6SessionFormatCodec } from '@qilin-agent/session-format-v5-to-v6'
import { assertReleasedV7Header } from './validation.ts'

function physicalV6(value: unknown): SessionFormatHeader {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 7) throw new SessionFormatError('expected format v7 physical header')
  return { ...value, version: 6 } as SessionFormatHeader
}

/**
 * V7 physical encoder and decoder reuse the released V6 row framing and admission.
 * V7 moves the writer version literal and admits `team/mode`, so the packed rows
 * keep their V6 framing.
 */
export const releasedV7SessionFormatCodec = Object.freeze({
  version: 7,
  decodeHeader(value: unknown) {
    return { ...releasedV6SessionFormatCodec.decodeHeader(physicalV6(value)), version: 7 }
  },
  createDecoder(value, recovery) {
    const decoder = releasedV6SessionFormatCodec.createDecoder(physicalV6(value), recovery)
    return {
      ...decoder,
      header: { ...decoder.header, version: 7 },
      decodeRow(row, context) {
        decoder.decodeRow(row, { emitRun: context.emitRun.bind(context), emitEvent: context.emitEvent.bind(context) })
      },
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertReleasedV7Header(header)
    return { ...releasedV6SessionFormatCodec.encodeHeader({ ...header, version: 6 }, inheritedEventCount), version: 7 }
  },
  encodeEvent(event) {
    return releasedV6SessionFormatCodec.encodeEvent(event)
  },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)
