// @vitest-environment jsdom
/**
 * Row mutations belong to the drawing that supplies them: a capability the
 * owner omits removes its menu items, so the tree never offers what it cannot do.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { FileTree } from '../src/client/FileTree.tsx'
import type { TreeState } from '../src/client/FileTree.tsx'
import { zh } from '../src/client/locales.ts'

const ROOT = '/work/app'
/** The real dictionary, so a menu item's copy is what the reader sees. */
const t: Parameters<typeof FileTree>[0]['t'] = key => zh[key as keyof typeof zh]
const state: TreeState = {
  root: ROOT,
  expanded: [],
  levels: {
    [ROOT]: {
      kind: 'ready',
      level: {
        entries: [{ name: 'src', type: 'directory' }, { name: 'README.md', type: 'file', size: 12 }],
        truncated: false,
      },
    },
  },
}

afterEach(() => { cleanup() })

/** One drawing's mutation set; absent members are capabilities it does not offer. */
interface Mutations {
  readonly onCreate?: () => void
  readonly onRename?: () => void
  readonly onDelete?: () => void
}

/**
 * Render the tree over one listed root and open its menus the way the reader does.
 * @param mutations - the row mutations the drawing supplies, if any.
 * @returns the view and the menu openers with an item lookup.
 */
function harness(mutations: Mutations = {}) {
  const view = render(<FileTree state={state} onToggle={vi.fn()} onOpen={vi.fn()} t={t} {...mutations} />)
  const contextMenu = (element: Element): void => {
    act(() => { fireEvent.contextMenu(element, { clientX: 5, clientY: 6 }) })
  }
  return {
    view,
    rowMenu: (path: string) => { contextMenu(view.container.querySelector('[data-files-path="' + ROOT + '/' + path + '"] > button') as Element) },
    backgroundMenu: () => { contextMenu(view.container.querySelector('[data-files-tree]') as Element) },
    item: (label: string) => view.queryByRole('menuitem', { name: label }),
  }
}

describe('FileTree row mutations', () => {
  it('offers nothing to mutate when the drawing supplies no capability', () => {
    const h = harness()
    h.backgroundMenu()
    // Nothing to create, so the background keeps the platform menu.
    expect(h.item(zh['menu.newFile'])).toBeNull()
    h.rowMenu('src')
    expect(h.item(zh['menu.newFile'])).toBeNull()
    expect(h.item(zh['menu.rename'])).toBeNull()
    expect(h.item(zh['menu.delete'])).toBeNull()
    // Copying a path is not a mutation, so it stays available.
    expect(h.item(zh['menu.copyRelative'])).not.toBeNull()
  })

  it('offers every mutation the drawing supplies, including the root create entries', () => {
    const h = harness({ onCreate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() })
    h.backgroundMenu()
    expect(h.item(zh['menu.newFile'])).not.toBeNull()
    expect(h.item(zh['menu.newFolder'])).not.toBeNull()
    h.rowMenu('src')
    expect(h.item(zh['menu.newFile'])).not.toBeNull()
    expect(h.item(zh['menu.rename'])).not.toBeNull()
    expect(h.item(zh['menu.delete'])).not.toBeNull()
    // A file row offers opening too, and never the create entries.
    h.rowMenu('README.md')
    expect(h.item(zh['menu.open'])).not.toBeNull()
    expect(h.item(zh['menu.newFile'])).toBeNull()
  })

  it('offers creation alone when only that capability is supplied', () => {
    const h = harness({ onCreate: vi.fn() })
    h.rowMenu('src')
    expect(h.item(zh['menu.newFile'])).not.toBeNull()
    expect(h.item(zh['menu.rename'])).toBeNull()
    expect(h.item(zh['menu.delete'])).toBeNull()
  })

  it('offers renaming alone when only that capability is supplied', () => {
    const h = harness({ onCreate: vi.fn(), onRename: vi.fn() })
    h.rowMenu('src')
    expect(h.item(zh['menu.rename'])).not.toBeNull()
    expect(h.item(zh['menu.delete'])).toBeNull()
  })

  it('offers deletion alone when only that capability is supplied', () => {
    const h = harness({ onCreate: vi.fn(), onDelete: vi.fn() })
    h.rowMenu('src')
    expect(h.item(zh['menu.delete'])).not.toBeNull()
    expect(h.item(zh['menu.rename'])).toBeNull()
  })
})
