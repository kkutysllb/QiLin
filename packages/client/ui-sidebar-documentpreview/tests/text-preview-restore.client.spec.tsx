// @vitest-environment jsdom
/**
 * The preview body's scroll restore: a remembered offset the loaded pages
 * cannot reach keeps the reader's place and reads the next page instead.
 *
 * jsdom performs no layout, so an element stays at scrollTop 0 however it is
 * assigned — exactly the "content shorter than the remembered offset" state a
 * real browser reaches by clamping, which the body answers by loading on.
 */
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { TextPreview } from '../src/client/TextPreview.tsx'
import { PATH, SESSION, TAB_ID, harness, page, settle } from './fixtures.client.ts'

afterEach(cleanup)

it('keeps the remembered offset and reads on when the pages cannot reach it', async () => {
  const h = harness({ 1: page(1, ['a', 'b', 'c'], false), 4: page(4, ['d', 'e'], false) })
  const view = render(<TextPreview {...h.props()} />)
  await settle()
  const body = view.container.querySelector<HTMLElement>('[data-textpreview-body]')
  expect(body).not.toBeNull()
  // The reader's place is remembered beyond what the first page can scroll to.
  h.instance.actions.scrolled(TAB_ID, 300)
  expect(body!.scrollTop).toBe(0)
  // The loaded page is shorter than the remembered offset, so a browser clamps
  // every assignment to the content's own height: model that clamp here.
  const clamp = { top: 0 }
  Object.defineProperty(body!, 'scrollTop', {
    configurable: true,
    get: () => clamp.top,
    set: (next: number) => { clamp.top = Math.min(next, 30) },
  })
  const more = view.container.querySelector<HTMLButtonElement>('[data-textpreview-more]')
  expect(more).not.toBeNull()
  fireEvent.click(more!)
  await settle()
  expect(h.read).toHaveBeenLastCalledWith(SESSION, PATH, 6, h.controller.signal)
})
