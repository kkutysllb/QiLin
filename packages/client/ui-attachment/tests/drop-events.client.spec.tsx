// @vitest-environment jsdom
/** droppedDirectories classifies directory entries from the drag DataTransfer item list. */
import { describe, expect, it } from 'vitest'
import { installDocumentDropEvents } from '../src/client/drop-events.ts'

interface FakeItem { kind: 'file' | 'string'; webkitGetAsEntry?: () => { isDirectory: boolean } | null }

function transfer(items: readonly FakeItem[], files: readonly File[]): DataTransfer {
  return { types: ['Files'], items, files, dropEffect: 'none' } as unknown as DataTransfer
}

function dropEvent(dataTransfer: DataTransfer): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  return event
}

describe('document drop events', () => {
  it('classifies only file items whose entry reports a directory', () => {
    const added: { files: readonly File[]; directories: ReadonlySet<File> | undefined }[] = []
    const dispose = installDocumentDropEvents(
      true,
      (files, directories) => { added.push({ files, directories }) },
      { current: 0 },
      () => {},
    )
    const plain = new File(['a'], 'a.txt')
    document.dispatchEvent(dropEvent(transfer([
      { kind: 'string' },
      { kind: 'file' },
      { kind: 'file', webkitGetAsEntry: () => null },
      { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false }) },
      { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) },
      { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) },
      { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) },
    ], [plain, new File([''], 'missing'), new File([''], 'file'), new File([''], 'dir'), new File([''], 'extra')])))
    dispose()
    expect(added).toHaveLength(1)
    expect(added[0]!.files.map(file => file.name)).toEqual(['a.txt', 'missing', 'file', 'dir', 'extra'])
    // Only the directory entries that paired with a yielded File enter the set; the string item,
    // the entry-less item, the file entry, and the directory without a File stay out.
    expect([...added[0]!.directories ?? []].map(file => file.name)).toEqual(['dir', 'extra'])
  })
})
