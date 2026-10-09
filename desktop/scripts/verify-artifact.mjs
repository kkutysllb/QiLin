// scripts/verify-artifact.mjs
/** Validate the runtime manifest and emit release artifact checksums. */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { sha256File } from './lib/hash.mjs'

/**
 * The manifest is stamped by build-runtime-bundle.sh from the repo HEAD it
 * built; the packaged version must be the same line of development.
 * @param {{ runtime: { qilinCommit?: string, qilinVersion?: string }, expected?: { version?: string } }} options
 *   `expected` carries the version of the packaging domain (package/package.json)
 *   and is compared against the manifest when present.
 * @returns {{ ok: boolean }} ok on a well-formed, consistent manifest.
 */
export function parseArtifactReport({ runtime, expected }) {
  if (!/^[0-9a-f]{40}$/.test(runtime.qilinCommit ?? '')) {
    throw new Error('artifact verify: manifest qilinCommit must be a 40-char sha')
  }
  if (expected?.version !== undefined && runtime.qilinVersion !== expected.version) {
    throw new Error(`artifact verify: version mismatch: runtime=${String(runtime.qilinVersion)} packaged=${String(expected.version)}`)
  }
  return { ok: true }
}

export async function checksums(artifactDir) {
  const names = (await readdir(artifactDir)).filter(name => /\.(dmg|zip|yml|json|blockmap)$/.test(name)).sort()
  if (names.length === 0) throw new Error(`artifact verify: no release files found in ${artifactDir}`)
  const lines = []
  for (const name of names) lines.push(`${await sha256File(join(artifactDir, name))}  ${name}`)
  return lines.join('\n')
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]))) {
  const [runtimeJsonPath, artifactDir, outPath] = process.argv.slice(2)
  if (!runtimeJsonPath || !artifactDir) {
    throw new Error('usage: verify-artifact.mjs <desktop-runtime.json> <artifactDir> [checksumsOut]')
  }
  const runtime = JSON.parse(await readFile(runtimeJsonPath, 'utf8'))
  const expected = await readFile(join(process.cwd(), 'package', 'package.json'), 'utf8')
    .then(text => ({ version: JSON.parse(text).version }))
    .catch(() => undefined)
  parseArtifactReport({ runtime, expected })
  const text = await checksums(artifactDir)
  await writeFile(outPath ?? join(artifactDir, 'checksums-sha256.txt'), `${text}\n`)
  console.log(`artifact verify ok: ${text.split('\n').length} file(s)`)
}
