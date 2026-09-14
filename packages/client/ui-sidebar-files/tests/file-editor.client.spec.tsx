// @vitest-environment jsdom
/**
 * The CodeMirror adapter: what one mount builds and what the gestures do.
 * The language and theme are static extensions here; their decisions live in
 * their own modules.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import { highlightingFor } from '@codemirror/language'
import { tags, type Tag } from '@lezer/highlight'
import { mountFileEditor } from '../src/client/file-editor.ts'
import type { FileEditorOptions } from '../src/client/file-editor.ts'

afterEach(cleanup)

async function mounted(overrides: Partial<FileEditorOptions> = {}) {
  const onDocumentChange = vi.fn()
  const onSave = vi.fn()
  const parent = document.createElement('div')
  document.body.append(parent)
  const handle = mountFileEditor(parent, {
    text: 'one',
    path: 'src/a.ts',
    wrap: false,
    onDocumentChange,
    onSave,
    ...overrides,
  })
  return { handle, onDocumentChange, onSave, parent }
}

describe('mountFileEditor', () => {
  it('mounts the view with the given document and reports it back', async () => {
    const { handle, parent } = await mounted()
    expect(handle.view.state.doc.toString()).toBe('one')
    expect(handle.getDocument()).toBe('one')
    expect(parent.querySelector('.cm-editor')).not.toBeNull()
    expect(parent.querySelector('.cm-gutters')).not.toBeNull()
  })

  it('a document change reaches onDocumentChange with the whole document', async () => {
    const { handle, onDocumentChange } = await mounted()
    handle.view.dispatch({ changes: { from: 3, insert: '!\ntwo' } })
    expect(onDocumentChange).toHaveBeenCalledWith('one!\ntwo')
  })

  it('Mod-s runs the save gesture', async () => {
    const { handle, onSave } = await mounted()
    fireEvent(handle.view.contentDOM, new KeyboardEvent('keydown', {
      key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true,
    }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('setWrap reconfigures in place; the same value does nothing', async () => {
    const { handle } = await mounted()
    handle.setWrap(false)
    expect(handle.view.state.doc.toString()).toBe('one')
    handle.setWrap(true)
    // The document survives the reconfigure.
    expect(handle.view.state.doc.toString()).toBe('one')
  })

  it('destroy detaches the view', async () => {
    const { handle } = await mounted()
    const dom = handle.view.dom
    handle.destroy()
    expect(dom.isConnected).toBe(false)
  })

  it('colors the common syntax tokens through --dsw-* tokens', async () => {
    const { handle } = await mounted({ path: 'src/a.ts' })
    // The style mounts as a stylesheet: a token tag resolves to a class whose
    // rule must carry the token color, end to end.
    const css = [...document.head.querySelectorAll('style')].map(node => node.textContent).join('\n')
    const ruleFor = (tagSet: readonly Tag[]): string => {
      const cls = highlightingFor(handle.view.state, tagSet)
      return css.split('}').find(rule => rule.includes('.' + cls)) ?? ''
    }
    expect(ruleFor([tags.comment])).toContain('var(--dsw-static-neutral-500)')
    expect(ruleFor([tags.keyword])).toContain('var(--dsw-static-red-500)')
    expect(ruleFor([tags.string])).toContain('var(--dsw-static-green-500)')
    expect(ruleFor([tags.number])).toContain('var(--dsw-static-amber-500)')
    expect(ruleFor([tags.function(tags.variableName)])).toContain('var(--dsw-static-blue-500)')
    expect(ruleFor([tags.typeName])).toContain('var(--dsw-static-deepseek-500)')
    expect(ruleFor([tags.propertyName])).toContain('var(--dsw-static-blue-400)')
  })

  it('a path without a grammar mounts as plain text', async () => {
    const { handle } = await mounted({ path: 'notes.txt' })
    expect(handle.view.state.doc.toString()).toBe('one')
  })
})
