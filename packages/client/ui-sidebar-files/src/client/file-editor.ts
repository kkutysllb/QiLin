/**
 * The CodeMirror adapter: everything the editor surface needs from CodeMirror
 * behind one mount call and one handle.
 *
 * The body never touches CodeMirror types; this module is the only one that
 * does. The theme colors every surface only through `--dsw-*` tokens, so the
 * token cascade re-themes the editor when the app's color scheme flips.
 * @module
 */
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { langForPath } from './file-lang.ts'

/** What the body holds after mounting, and what it can change in place. */
export interface FileEditorHandle {
  /** The live view: the body needs nothing from it; specs and callers do. */
  readonly view: EditorView
  /** Destroy the view and detach its DOM. */
  destroy(): void
  /** @returns the editor's current document. */
  getDocument(): string
  /**
   * Turn line wrapping on or off without disturbing the document, history,
   * or scroll position.
   * @param wrap - whether lines wrap.
   */
  setWrap(wrap: boolean): void
}

/** What one mount needs: the document, its grammar, and the two gestures. */
export interface FileEditorOptions {
  /** The initial document: the loaded text, or the unsaved draft. */
  readonly text: string
  /** The file's path, for the grammar. */
  readonly path: string
  /** Whether lines wrap initially. */
  readonly wrap: boolean
  /**
   * Called after every document change with the whole document.
   * @param text - the editor document.
   */
  readonly onDocumentChange: (text: string) => void
  /** Called for the platform save gesture (`Mod-s`). */
  readonly onSave: () => void
}

/**
 * The editor's surface theme. Every color is a `--dsw-*` token, so the token
 * cascade carries light and dark schemes without a second theme.
 */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--dsw-alias-label-primary)',
    backgroundColor: 'transparent',
    fontSize: 'var(--qilin-content-font-size-secondary, 13px)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    // The pane body's 2px scrollbar offset, as the tree's scroll area keeps it.
    scrollbarGutter: 'stable',
    fontFamily: 'var(--ds-font-family-code, ui-monospace)',
    lineHeight: '1.6',
  },
  '.cm-content': { caretColor: 'var(--dsw-alias-label-primary)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dsw-alias-label-primary)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--dsw-alias-bg-multi-select)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--dsw-alias-interactive-bg-hover)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'transparent',
    outline: '0.5px solid var(--dsw-alias-border-l3)',
  },
}, { dark: false })

/**
 * Syntax colors, one small map from the common token tags to the static
 * `--dsw-*` palette: mid-tones that hold on both the light and the dark
 * background without a per-scheme style.
 */
const syntaxColors = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--dsw-static-neutral-500)' },
  { tag: tags.keyword, color: 'var(--dsw-static-red-500)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--dsw-static-green-500)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--dsw-static-amber-500)' },
  { tag: tags.function(tags.variableName), color: 'var(--dsw-static-blue-500)' },
  { tag: [tags.typeName, tags.className], color: 'var(--dsw-static-deepseek-500)' },
  { tag: tags.propertyName, color: 'var(--dsw-static-blue-400)' },
])

/**
 * Mount one editor view into `host`.
 * @param host - the element the view attaches to; its size is the editor's.
 * @param options - the document, its grammar, and the two gestures.
 * @returns the handle the body keeps until unmount.
 */
export function mountFileEditor(host: HTMLElement, options: FileEditorOptions): FileEditorHandle {
  // The wrap-only compartment: reconfiguring it leaves the document, the
  // undo history, and the scroll position untouched.
  const wrapCompartment = new Compartment()
  const language = langForPath(options.path)
  let wrapOn = options.wrap
  const view = new EditorView({
    state: EditorState.create({
      doc: options.text,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        syntaxHighlighting(syntaxColors),
        EditorState.tabSize.of(2),
        editorTheme,
        wrapCompartment.of(wrapOn ? EditorView.lineWrapping : []),
        ...(language !== undefined ? [language] : []),
        keymap.of([{
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            options.onSave()
            return true
          },
        }, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onDocumentChange(update.state.doc.toString())
        }),
      ],
    }),
    parent: host,
  })
  return {
    view,
    destroy: () => { view.destroy() },
    getDocument: () => view.state.doc.toString(),
    setWrap: (wrap: boolean) => {
      if (wrap === wrapOn) return
      wrapOn = wrap
      view.dispatch({ effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []) })
    },
  }
}
