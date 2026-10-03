/** Trigger-branch policy: every workflow branch filter and ref gate names this repository's default branch. */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const workflowsDir = resolve(import.meta.dirname, '../../.github/workflows')

/**
 * `origin/HEAD`. Upstream's workflow files name `master` and this repository
 * imports them wholesale, so a filter that keeps upstream's branch silently
 * stops firing here instead of failing.
 */
const defaultBranch = 'main'

interface Workflow {
  readonly on?: Record<string, unknown>
  readonly jobs?: Record<string, unknown>
  readonly env?: Record<string, unknown>
}

/** Every branch name a workflow's event filters and job conditions reference. */
function branchReferences(workflow: Workflow): string[] {
  const names = new Set<string>()
  for (const event of ['push', 'pull_request']) {
    const filter = workflow.on?.[event]
    if (typeof filter !== 'object' || filter === null) continue
    const branches = (filter as { branches?: unknown }).branches
    if (!Array.isArray(branches)) continue
    for (const name of branches) if (typeof name === 'string') names.add(name)
  }
  for (const job of Object.values(workflow.jobs ?? {})) {
    if (typeof job !== 'object' || job === null) continue
    for (const field of ['if', 'runs-on'] as const) {
      const value = (job as Record<string, unknown>)[field]
      const texts = typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === 'string')
          : []
      for (const text of texts) {
        for (const match of text.matchAll(/refs\/heads\/([\w./-]+)/gu)) names.add(match[1] as string)
      }
    }
  }
  return [...names].sort()
}

/** One workflow by file name, parsed from the workflows directory. */
function workflow(name: string): Workflow {
  return load(readFileSync(resolve(workflowsDir, name), 'utf8')) as Workflow
}

const files = readdirSync(workflowsDir).filter(file => file.endsWith('.yml')).sort()

describe('workflow trigger branches', () => {
  it('scans the workflow corpus', () => {
    // An empty or narrowed corpus would pass the per-file check vacuously.
    expect(files.length).toBeGreaterThan(10)
    expect(files).toContain('ci-master.yml')
    expect(files).toContain('e2e.yml')
    expect(files).toContain('release.yml')
  })

  it.each(files)('%s names only the default branch', (file) => {
    expect(branchReferences(workflow(file)).filter(name => name !== defaultBranch)).toEqual([])
  })

  it('rejects the upstream branch filter and ref gates it replaced', () => {
    expect(branchReferences({ on: { push: { branches: ['master'] } } })).toEqual(['master'])
    expect(branchReferences({ jobs: { build: { if: "github.ref == 'refs/heads/master'" } } })).toEqual(['master'])
    expect(branchReferences({
      jobs: { pack: { 'runs-on': "${{ github.ref == 'refs/heads/master' && 'a' || 'b' }}" } },
    })).toEqual(['master'])
  })

  it("leaves another repository's branch out of scope", () => {
    // The projection reads the public documentation repository, whose own
    // default branch is `master`; no filter or ref gate here names it.
    const docs = workflow('docs-pages.yml')
    expect(branchReferences(docs)).toEqual([])
    expect(docs.env?.DOCS_REPOSITORY_REF).toBe('master')
  })
})
