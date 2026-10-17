/**
 * The lightbox's caption clearance as CSS text: class maps resolve to names in
 * the component suite, so only the stylesheet can prove the painted stage stops
 * below the Windows caption while the click-blocking layer still covers it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/ImageLightbox.module.css', import.meta.url)), 'utf8')

/**
 * The declarations of one top-level rule.
 * @param selector - the rule's selector text, as written in the stylesheet.
 * @returns the rule body.
 */
function declarations(selector: string): string {
  const rule = new RegExp(`\\${selector} \\{([^}]*)\\}`).exec(css)
  if (rule === null) throw new Error(`ImageLightbox.module.css has no ${selector} rule`)
  return rule[1] ?? ''
}

describe('ImageLightbox.module.css', () => {
  it('blocks clicks over the whole viewport, caption included', () => {
    const backdrop = declarations('.backdrop')
    expect(backdrop).toContain('position: fixed')
    expect(backdrop).toContain('inset: 0')
  })

  it('paints below the desktop frame caption and keeps the caption unpainted', () => {
    const stage = declarations('.stage')
    expect(stage).toContain('inset: var(--dsh-frame-chrome-top, 0px) 0 0')
    expect(declarations('.mask')).toContain('inset: 0')
  })

  it('sizes the preview to the stage rather than the viewport', () => {
    expect(declarations('.image')).toContain('max-height: 100%')
  })
})
