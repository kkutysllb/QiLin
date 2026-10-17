/**
 * Unit tests for the ordered head/tail retention helper. The plugin suite
 * covers replacement through `ctx.tools.execute`; these tests drive the
 * block-level rules directly so whole-block retention, indivisible images, and
 * UTF-16 surrogate safety stay pinned independently of the tool pipeline.
 */

import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@qilin-agent/attachment'
import type { ImageAttachmentRef } from '@qilin-agent/attachment'
import { retainContent } from '../src/retention.ts'
import type { RetainableBlock } from '../src/retention.ts'

const IMAGE: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png',
  bytes: 12,
  width: 4,
  height: 4,
}

/** One whole image block; `cost` is supplied by the per-test price map. */
function image(): RetainableBlock {
  return { type: 'image', attachment: IMAGE }
}

/** One text block. */
function text(value: string): RetainableBlock {
  return { type: 'text', text: value }
}

/**
 * A monotonic price: one token per UTF-16 code unit, images priced from
 * `costs` (default 1) so a test can make one image indivisibly expensive.
 */
function price(costs: ReadonlyMap<RetainableBlock, number> = new Map()): (block: RetainableBlock) => number {
  return block => block.type === 'image' ? costs.get(block) ?? 1 : block.text.length
}

const textOf = (blocks: readonly RetainableBlock[]): string =>
  blocks.filter(block => block.type === 'text').map(block => block.text).join('|')

describe('retainContent', () => {
  it('keeps whole head blocks while the half budget lasts, then the largest text prefix', () => {
    const first = image()
    const second = image()
    const body = text('x'.repeat(200))

    const retained = retainContent([first, second, body], 12, price())

    expect(retained.head).toEqual([first, second, text('x'.repeat(4))])
    expect(retained.tail).toEqual([text('x'.repeat(6))])
    expect(retained.omittedBytes).toBe(200 - 4 - 6)
    expect(retained.omittedImages).toBe(0)
  })

  it('keeps a whole tail block when the head stopped early and that block fits', () => {
    const body = text('y'.repeat(200))
    const trailing = image()

    const retained = retainContent([body, trailing], 12, price())

    expect(textOf(retained.head)).toBe('y'.repeat(6))
    expect(retained.tail.map(block => block.type)).toEqual(['text', 'image'])
    expect(retained.tail.at(-1)).toEqual(trailing)
    expect(retained.omittedBytes).toBe(200 - 6 - 5)
    expect(retained.omittedImages).toBe(0)
  })

  it('omits an image whole at either end instead of retaining part of it', () => {
    const expensive = image()

    const retained = retainContent([expensive, text('abc')], 10, price(new Map([[expensive, 100]])))

    expect(retained.head).toEqual([])
    expect(retained.tail).toEqual([text('abc')])
    expect(retained.omittedBytes).toBe(0)
    expect(retained.omittedImages).toBe(1)
  })

  it('never splits a UTF-16 surrogate pair at either retained end', () => {
    const body = text('AB\u{1F600}CD')

    const retained = retainContent([body], 2, price())

    expect(retained.head).toEqual([text('A')])
    expect(retained.tail).toEqual([text('D')])
    expect(retained.omittedBytes).toBe(Buffer.byteLength('AB\u{1F600}CD', 'utf8') - 2)
    expect(retained.omittedImages).toBe(0)
  })

  it('retains nothing when the image budget cannot hold the only block', () => {
    const expensive = image()

    const retained = retainContent([expensive], 4, price(new Map([[expensive, 100]])))

    expect(retained.head).toEqual([])
    expect(retained.tail).toEqual([])
    expect(retained.omittedBytes).toBe(0)
    expect(retained.omittedImages).toBe(1)
  })
})
