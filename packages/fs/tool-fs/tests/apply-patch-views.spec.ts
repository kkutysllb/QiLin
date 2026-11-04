/**
 * The patch tool's model-facing views and its canonical value: rendering a
 * stopped or empty patch, previewing a call, presenting a result, and the
 * refusal a first-operation failure produces.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { patchPresentationMeta, patchToolValue, renderPatch } from '../src/apply-patch-output.ts'
import { presentPatchCall, presentPatchResult } from '../src/apply-patch-presentation.ts'
import type { PatchExecutionReport, PatchOperationRecord } from '../src/patch/types.ts'

/** Set to make the parser throw a defect that is not a syntax refusal. */
const parser = vi.hoisted(() => ({ fail: false }))
vi.mock('@qilin-agent/fs-patch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qilin-agent/fs-patch')>()
  return {
    ...actual,
    parsePatch: (text: string) => {
      if (parser.fail) throw new Error('parser defect')
      return actual.parsePatch(text)
    },
  }
})

afterEach(() => { parser.fail = false })

const record = (index: number, kind: PatchOperationRecord['kind'], path = 'a.txt'): PatchOperationRecord =>
  ({ index, kind, path, patchLine: index + 2 })

/** One committed report; the cases vary only what each outcome carries. */
const commit = (report: Omit<Extract<PatchExecutionReport, { phase: 'commit' }>, 'phase'>): Extract<PatchExecutionReport, { phase: 'commit' }> =>
  ({ phase: 'commit', ...report })

describe('renderPatch', () => {
  it('reports a patch that carries no operation', () => {
    const value = patchToolValue(commit({ outcomes: [], affectedPaths: [], cancelled: false }))
    expect(renderPatch(value)).toBe('Success. No operations in patch.')
  })

  it('lists a stopped patch that completed nothing as not executed', () => {
    const outcomes = [
      { status: 'skipped' as const, operation: record(0, 'add') },
      { status: 'skipped' as const, operation: record(1, 'delete') },
    ]
    const value = patchToolValue(commit({ outcomes, affectedPaths: [], cancelled: true }))
    expect(value.cancelled).toBe(true)
    const text = renderPatch(value)
    expect(text).toContain('Patch stopped after 0 of 2 operations.')
    expect(text).toContain('Not executed:')
    expect(text).not.toContain('Completed:')
  })
})

describe('patchToolValue', () => {
  it('refuses a first operation that failed before changing anything', () => {
    const outcomes = [
      { status: 'failed' as const, operation: record(0, 'add'), failure: { code: 'FS_PERMISSION_DENIED' as const, message: 'denied' }, changes: [] },
      { status: 'skipped' as const, operation: record(1, 'add') },
    ]
    // No disk change exists, so the error code reaches the same retry paths as a refusal.
    expect(() => patchToolValue(commit({ outcomes, affectedPaths: [], cancelled: false })))
      .toThrow('Patch rejected before any change (1 problems):')
  })
})

describe('patchPresentationMeta', () => {
  it('contributes no diff for an operation whose value records no changes', () => {
    const value = patchToolValue(commit({
      outcomes: [{ status: 'completed', operation: record(0, 'add'),
        changes: [{ path: 'a.txt', before: null, after: 'x' }] }],
      affectedPaths: ['a.txt'], cancelled: false,
    }))
    // A creation stores no diff text, and a stored value that carries no changes contributes none either.
    const withoutChanges = { ...value, operations: value.operations.map(({ index, kind, path, patchLine, status }) =>
      ({ index, kind, path, patchLine, status })) }
    expect(patchPresentationMeta(withoutChanges)).toEqual({ diffs: [], stopped: false })
  })
})

describe('presentPatchCall', () => {
  it('previews one file in the singular', () => {
    const view = presentPatchCall(['*** Begin Patch', '*** Add File: only.txt', '+x', '*** End Patch'].join('\n'))
    expect(view?.title).toBe('Apply patch (1 file)')
    expect(view?.locations).toEqual([{ path: 'only.txt' }])
  })

  it('previews an addition-only update without an old side', () => {
    const view = presentPatchCall(['*** Begin Patch', '*** Update File: a.txt', '@@', '+added', '*** End Patch'].join('\n'))
    expect(view?.diffs).toEqual([{ path: 'a.txt', oldText: null, newText: 'added' }])
  })

  it('rethrows a parser defect instead of pretending the patch is invalid', () => {
    parser.fail = true
    expect(() => presentPatchCall('anything')).toThrow('parser defect')
  })
})

describe('presentPatchResult', () => {
  it('leaves a failed result to the generic renderer', () => {
    expect(presentPatchResult({ isError: true, meta: undefined } as never)).toBeUndefined()
  })

  it('leaves a result without applied hunks to the generic renderer', () => {
    expect(presentPatchResult({ isError: false, meta: { other: true } } as never)).toBeUndefined()
  })

  it('titles a stopped patch so the reader knows operations remain', () => {
    const meta = { diffs: [{ path: 'a.txt', oldText: 'old', newText: 'new' }], stopped: true }
    expect(presentPatchResult({ isError: false, meta } as never)).toEqual({
      card: 'diff', title: 'Apply patch (stopped)',
      diffs: [{ path: 'a.txt', oldText: 'old', newText: 'new' }],
    })
  })
})
