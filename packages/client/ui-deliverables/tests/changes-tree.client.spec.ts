/**
 * The directory-tree projection of a changed-path list: nesting, order,
 * single-child chain compression, recursive counts, and the rows a folded
 * tree draws.
 */
import { describe, expect, it } from 'vitest'
import { buildChangesTree, flattenChangesTree, type ChangesTreeNode } from '../src/client/changes-tree.ts'

/** Every row the tree would draw, as `label` strings with directories marked. */
function outline(nodes: readonly ChangesTreeNode<string>[]): string[] {
  return flattenChangesTree(nodes, () => false).map(node => node.kind === 'dir'
    ? `dir ${node.name} (${node.count}) d${node.depth}`
    : `file ${node.name} d${node.depth}`)
}

describe('changes tree — building', () => {
  it('nests files under their directories, directories first', () => {
    const tree = buildChangesTree([
      { path: 'notes.txt', item: 'notes.txt' },
      { path: 'src/app.ts', item: 'src/app.ts' },
    ])
    expect(outline(tree)).toEqual(['dir src (1) d0', 'file app.ts d1', 'file notes.txt d0'])
  })

  it('compresses a chain of single-child directories into one row', () => {
    const tree = buildChangesTree([{ path: 'src/client/office/viewer/x.ts', item: 'x' }])
    expect(outline(tree)).toEqual(['dir src/client/office/viewer (1) d0', 'file x.ts d1'])
  })

  it('keeps a directory that holds a file of its own uncompressed', () => {
    const tree = buildChangesTree([
      { path: 'src/app.ts', item: 'app' },
      { path: 'src/client/office/x.ts', item: 'x' },
    ])
    expect(outline(tree)).toEqual([
      'dir src (2) d0', 'dir client/office (1) d1', 'file x.ts d2', 'file app.ts d1',
    ])
  })

  it('counts a subtree recursively', () => {
    const tree = buildChangesTree([
      { path: 'a/b/one.ts', item: 'one' },
      { path: 'a/b/two.ts', item: 'two' },
      { path: 'a/c/three.ts', item: 'three' },
    ])
    expect(outline(tree)).toEqual([
      'dir a (3) d0',
      'dir b (2) d1', 'file one.ts d2', 'file two.ts d2',
      'dir c (1) d1', 'file three.ts d2',
    ])
  })

  it('orders case-insensitively with a stable tiebreak, directories before files', () => {
    const tree = buildChangesTree([
      { path: 'B.txt', item: 'B' },
      { path: 'a.txt', item: 'a' },
      { path: 'z/inner.ts', item: 'inner' },
      { path: 'A.txt', item: 'A' },
    ])
    expect(outline(tree)).toEqual([
      'dir z (1) d0', 'file inner.ts d1',
      'file A.txt d0', 'file a.txt d0', 'file B.txt d0',
    ])
  })

  it('tolerates repeated, empty, and leading segments', () => {
    const tree = buildChangesTree([
      { path: '//a//b.ts', item: 'b' },
      { path: 'a/b.ts', item: 'b again' },
      { path: 'plain', item: 'plain' },
    ])
    expect(outline(tree)).toEqual(['dir a (2) d0', 'file b.ts d1', 'file b.ts d1', 'file plain d0'])
  })

  it('reports no rows for an empty list', () => {
    expect(buildChangesTree([])).toEqual([])
  })
})

describe('changes tree — flattening', () => {
  const tree = buildChangesTree([
    { path: 'src/app.ts', item: 'app' },
    { path: 'src/client/x.ts', item: 'x' },
    { path: 'notes.txt', item: 'notes' },
  ])

  it('draws every row while nothing is folded', () => {
    expect(flattenChangesTree(tree, () => false).map(node => node.path))
      .toEqual(['src', 'src/client', 'src/client/x.ts', 'src/app.ts', 'notes.txt'])
  })

  it('keeps a folded directory’s own row and drops its subtree', () => {
    expect(flattenChangesTree(tree, path => path === 'src/client').map(node => node.path))
      .toEqual(['src', 'src/client', 'src/app.ts', 'notes.txt'])
  })

  it('drops the whole subtree when the outermost directory is folded', () => {
    expect(flattenChangesTree(tree, path => path === 'src').map(node => node.path))
      .toEqual(['src', 'notes.txt'])
  })
})

describe('changes tree — name ties', () => {
  it('keeps two casings of one name in a stable order', () => {
    expect(outline(buildChangesTree([{ path: 'b.ts', item: 'lower' }, { path: 'B.ts', item: 'upper' }])))
      .toEqual(['file B.ts d0', 'file b.ts d0'])
  })

  it('orders three casings of one name', () => {
    expect(outline(buildChangesTree([{ path: 'c.ts', item: 'c' }, { path: 'B.ts', item: 'upper' }, { path: 'b.ts', item: 'lower' }])))
      .toEqual(['file B.ts d0', 'file b.ts d0', 'file c.ts d0'])
  })

  it('keeps an exactly repeated path as two rows', () => {
    expect(outline(buildChangesTree([{ path: 'a.ts', item: 'first' }, { path: 'a.ts', item: 'second' }])))
      .toEqual(['file a.ts d0', 'file a.ts d0'])
  })
})
