/** V6 framing reusing the released V5 physical rows and admission. */

import { SessionFormatError, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatHeader } from '@qilin-agent/session-format'
import { releasedV5SessionFormatCodec } from '@qilin-agent/session-format-v4-to-v5'
import { assertReleasedV6Header } from './validation.ts'

function physicalV5(value: unknown): SessionFormatHeader {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 6) throw new SessionFormatError('expected format v6 physical header')
  return { ...value, version: 5 } as SessionFormatHeader
}

/**
 * V6 physical encoder and decoder reuse the released V5 row framing and admission.
 * V6 moves the writer version literal and the declared producer vocabulary only,
 * so the packed rows keep their V5 framing.
 */
export const releasedV6SessionFormatCodec = Object.freeze({
  version: 6,
  decodeHeader(value: unknown) {
    return { ...releasedV5SessionFormatCodec.decodeHeader(physicalV5(value)), version: 6 }
  },
  createDecoder(value, recovery) {
    const decoder = releasedV5SessionFormatCodec.createDecoder(physicalV5(value), recovery)
    return {
      ...decoder,
      header: { ...decoder.header, version: 6 },
      decodeRow(row, context) {
        decoder.decodeRow(row, { emitRun: context.emitRun.bind(context), emitEvent: context.emitEvent.bind(context) })
      },
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertReleasedV6Header(header)
    return { ...releasedV5SessionFormatCodec.encodeHeader({ ...header, version: 5 }, inheritedEventCount), version: 6 }
  },
  encodeEvent(event) {
    return releasedV5SessionFormatCodec.encodeEvent(event)
  },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)
