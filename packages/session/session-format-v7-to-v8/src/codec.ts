/** V8 framing reusing the released V7 physical rows and admission. */

import { SessionFormatError, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatHeader } from '@qilin-agent/session-format'
import { releasedV7SessionFormatCodec } from '@qilin-agent/session-format-v6-to-v7'
import { assertReleasedV8Header } from './validation.ts'

function physicalV7(value: unknown): SessionFormatHeader {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 8) throw new SessionFormatError('expected format v8 physical header')
  return { ...value, version: 7 } as SessionFormatHeader
}

/**
 * V8 physical encoder and decoder reuse the released V7 row framing and
 * admission: V8 moves the writer version literal and the coding preset label,
 * so the packed rows keep their V7 framing.
 */
export const releasedV8SessionFormatCodec = Object.freeze({
  version: 8,
  decodeHeader(value: unknown) {
    return { ...releasedV7SessionFormatCodec.decodeHeader(physicalV7(value)), version: 8 }
  },
  createDecoder(value: unknown, recovery) {
    const decoder = releasedV7SessionFormatCodec.createDecoder(physicalV7(value), recovery)
    return {
      ...decoder,
      header: { ...decoder.header, version: 8 },
      decodeRow(row, context) {
        decoder.decodeRow(row, { emitRun: context.emitRun.bind(context), emitEvent: context.emitEvent.bind(context) })
      },
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertReleasedV8Header(header)
    return { ...releasedV7SessionFormatCodec.encodeHeader({ ...header, version: 7 }, inheritedEventCount), version: 8 }
  },
  encodeEvent(event) {
    return releasedV7SessionFormatCodec.encodeEvent(event)
  },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)
