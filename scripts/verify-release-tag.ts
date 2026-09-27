/**
 * Enforce the repository's release rule: a push that updates `main` ships a
 * version — the pushed commit carries an annotated `v*` tag whose GitHub
 * Release carries written notes. Registered as a lefthook `pre-push` job, it
 * reads the pushed refs from stdin like git's own hook and falls back to
 * comparing `main` with `origin/main` when no ref lines arrive (lefthook does
 * not forward them), which also means a tag-only push must come after its
 * release exists — bootstrap the very first one with `QILIN_RELEASE_SKIP=<reason>`.
 * That variable is the deliberate one-shot bypass for an unreachable GitHub.
 * @module verify-release-tag
 */

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

/** One ref update git reports on pre-push stdin. */
export interface PushRef {
  readonly localRef: string
  readonly sha: string
  readonly remoteRef: string
}

/** The sha git uses for a deletion; a deleted `main` enforces nothing. */
const DELETED_SHA = '0'.repeat(40)

/** Shortest body that counts as written notes rather than a stub. */
const MIN_NOTES_LENGTH = 80

/** Parse git's pre-push stdin (one `local-ref local-sha remote-ref remote-sha` per line). */
export function parsePushRefs(raw: string): PushRef[] {
  return raw.split('\n').flatMap((line) => {
    const parts = line.trim().split(/\s+/u)
    if (parts.length !== 4 || parts.some(part => part === '')) return []
    return [{ localRef: parts[0] as string, sha: parts[1] as string, remoteRef: parts[2] as string }]
  })
}

/** The sha this push installs on `refs/heads/main`, when the push touches main at all. */
export function mainPushSha(refs: readonly PushRef[]): string | undefined {
  const main = refs.find(ref => ref.remoteRef === 'refs/heads/main')
  if (main === undefined || main.sha === DELETED_SHA) return undefined
  return main.sha
}

/** Every `v*` version tag in the list (`git tag --points-at` already resolved the commit). */
export function releaseTagsAt(tags: readonly string[]): string[] {
  return tags.filter(tag => /^v\d+(?:\.\d+)*$/u.test(tag))
}

/** What blocks shipping `sha`, given the tags at it and each tag's release body. */
export type ReleaseReadiness =
  | { readonly ok: true; readonly tag: string }
  | { readonly ok: false; readonly problem: 'tag' | 'release' | 'notes' | 'version'; readonly message: string }

/**
 * The version a `vX.Y.Z` tag names.
 * @param tag - Release tag.
 * @returns The version, or undefined when the tag names none.
 */
export function tagVersion(tag: string): string | undefined {
  return /^v(\d+(?:\.\d+)*)$/u.exec(tag)?.[1]
}

/**
 * Whether the shipping commit declares the version its tag names. The interface
 * reads the root manifest's version at build time, so a release whose manifests
 * were never bumped ships screens that still name the predecessor.
 * @param tag - Release tag.
 * @param declared - Root manifest version at the shipping commit.
 * @returns The blocking message, or undefined when they agree.
 */
export function versionProblem(tag: string, declared: string | undefined): string | undefined {
  const version = tagVersion(tag)
  if (version === undefined || declared === version) return undefined
  return `tag ${tag} names ${version} but the root manifest declares ${declared ?? '(no version)'}; bump the family before tagging: pnpm run version:set ${version}`
}

/**
 * Decide whether `sha` may ship: some `v*` tag at it must carry a release with
 * notes, and the commit's declared version must be the tag's.
 * @param sha - Commit to ship.
 * @param tags - Tags at that commit.
 * @param releaseBodyOf - Release body reader.
 * @param declaredVersion - Root manifest version at that commit.
 * @returns The readiness verdict.
 */
export function evaluateReleaseReadiness(
  sha: string,
  tags: readonly string[],
  releaseBodyOf: (tag: string) => string | undefined,
  declaredVersion?: string,
): ReleaseReadiness {
  const candidates = releaseTagsAt(tags)
  if (candidates.length === 0) {
    return {
      ok: false,
      problem: 'tag',
      message: `no v* tag points at ${sha}; cut one first: git tag -a vX.Y.Z ${sha} -m "QiLin vX.Y.Z — <summary>"`,
    }
  }
  for (const tag of candidates) {
    const body = releaseBodyOf(tag)
    if (body === undefined) continue
    if (body.trim().length < MIN_NOTES_LENGTH) {
      return {
        ok: false,
        problem: 'notes',
        message: `release ${tag} has no written notes (body under ${String(MIN_NOTES_LENGTH)} chars); edit it or recreate with --notes-file`,
      }
    }
    const drifted = versionProblem(tag, declaredVersion)
    if (drifted !== undefined) return { ok: false, problem: 'version', message: drifted }
    return { ok: true, tag }
  }
  return {
    ok: false,
    problem: 'release',
    message: `no GitHub release exists for ${candidates.join(', ')}; publish one: gh release create <tag> --title "QiLin <tag> · <title>" --notes-file <notes.md>`,
  }
}

/** Collect git's own view of the tags at one commit. */
function tagsAt(sha: string): string[] {
  return execFileSync('git', ['tag', '--points-at', sha], { encoding: 'utf8' }).split('\n').filter(line => line !== '')
}

/** One tag's release body, or undefined when GitHub answers no release. */
function releaseBodyOf(tag: string): string | undefined {
  try {
    return execFileSync('gh', ['release', 'view', tag, '--json', 'body', '-q', '.body'], { encoding: 'utf8' })
  } catch {
    return undefined
  }
}

/** The root manifest's version at one commit, or undefined when it declares none. */
function declaredVersionAt(sha: string): string | undefined {
  try {
    const manifest = JSON.parse(execFileSync('git', ['show', `${sha}:package.json`], { encoding: 'utf8' })) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/** The commit sha one ref name resolves to, or undefined when it does not exist. */
function revParse(ref: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

/** Read stdin, giving up after `ms` so a hook that never closes the pipe cannot hang the push. */
function readStdinWithTimeout(ms: number): Promise<string> {
  return new Promise((resolve) => {
    let raw = ''
    const timer = setTimeout(() => { process.stdin.destroy(); resolve(raw) }, ms)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { raw += chunk })
    process.stdin.on('end', () => { clearTimeout(timer); resolve(raw) })
    process.stdin.on('error', () => { clearTimeout(timer); resolve(raw) })
  })
}

async function main(): Promise<void> {
  const skip = process.env.QILIN_RELEASE_SKIP
  if (skip !== undefined) {
    console.log(`verify-release-tag: skipped by QILIN_RELEASE_SKIP (${skip})`)
    return
  }
  const raw = process.stdin.isTTY ? '' : await readStdinWithTimeout(1_500)
  const refs = parsePushRefs(raw)
  let sha = mainPushSha(refs)
  if (sha === undefined) {
    // Piped refs are authoritative: a push that does not touch main (a branch
    // or tag push) is exempt. Only when no ref lines arrived at all — an
    // environment that did not pipe stdin — fall back to comparing local
    // `main` with `origin/main`, which is the push this hook guards.
    if (refs.length > 0) {
      console.log('verify-release-tag: push does not update main')
      return
    }
    const local = revParse('refs/heads/main')
    const remote = revParse('refs/remotes/origin/main')
    if (local === undefined || local === remote) {
      console.log('verify-release-tag: no main update to push')
      return
    }
    sha = local
  }
  const result = evaluateReleaseReadiness(sha, tagsAt(sha), releaseBodyOf, declaredVersionAt(sha))
  if (result.ok) {
    console.log(`verify-release-tag: main ships ${result.tag}`)
    return
  }
  console.error(`verify-release-tag: ${result.message}`)
  process.exitCode = 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
