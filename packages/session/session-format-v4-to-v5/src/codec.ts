/** V5 framing reusing the released V4 physical rows and admission. */

import { SessionFormatError, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatHeader, SessionFormatEvent } from '@qilin-agent/session-format'
import { releasedV2SessionFormatCodec } from '@qilin-agent/session-format-v2-to-v3'
import { assertV4DeveloperData, assertV4RetiredSyntax, assertV4RowAdmission } from '@qilin-agent/session-format-v3-to-v4'
import { assertReleasedV5Header } from './validation.ts'

function physicalV2(value: unknown): SessionFormatHeader {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 5) throw new SessionFormatError('expected format v5 physical header')
  return { ...value, version: 2 } as SessionFormatHeader
}

/**
 * V5 physical encoder and decoder retain the released row framing and the
 * released V4 row admission; V5 adds vocabulary only, which headers and the
 * migration edge own.
 */
export const releasedV5SessionFormatCodec = Object.freeze({
  version: 5,
  decodeHeader(value: unknown) {
    return { ...releasedV2SessionFormatCodec.decodeHeader(physicalV2(value)), version: 5 }
  },
  createDecoder(value, recovery) {
    const decoder = releasedV2SessionFormatCodec.createDecoder(physicalV2(value), recovery)
    return {
      ...decoder,
      header: { ...decoder.header, version: 5 },
      decodeRow(row, context) {
        assertV4RowAdmission(row)
        decoder.decodeRow(row, {
          emitRun: context.emitRun.bind(context),
          emitEvent: context.emitEvent.bind(context),
        })
      },
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertReleasedV5Header(header)
    return { ...releasedV2SessionFormatCodec.encodeHeader({ ...header, version: 2 }, inheritedEventCount), version: 5 }
  },
  encodeEvent(event: SessionFormatEvent) {
    if (event.type === 'developer/message' && event['ignorable'] === true) {
      assertV4DeveloperData(event)
      assertV4RetiredSyntax(event)
    }
    assertV4RowAdmission(event)
    return releasedV2SessionFormatCodec.encodeEvent(event)
  },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)
