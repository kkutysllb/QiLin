// scripts/generate-release-manifest.mjs
/** Combine the runtime manifest, sync report and checksums into releases/manifest.json. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/**
 * @param {{ runtime: { qilinVersion?: string, qilinCommit?: string }, productVersion: string, sync: { match: boolean, webBundleSha256: string }, checksums: string, brand?: { sharedThemeVersion?: string } }} options
 *   `runtime` is staging/desktop-runtime.json (stamped by build-runtime-bundle.sh);
 *   `productVersion` is the version the packaging domain shipped.
 * @returns {object} Release manifest for releases/manifest.json.
 */
export function buildManifest({ runtime, productVersion, sync, checksums, brand }) {
  if (!sync.match) throw new Error('release manifest: refusing to record a failed sync state')
  if (typeof sync.webBundleSha256 !== 'string') throw new Error('release manifest: sync report missing webBundleSha256')
  if (typeof brand?.sharedThemeVersion !== 'string' || brand.sharedThemeVersion === '') {
    throw new Error(`release manifest: brand manifest missing sharedThemeVersion, got ${JSON.stringify(brand?.sharedThemeVersion)}`)
  }
  const artifacts = checksums.split('\n').filter(Boolean).map(line => line.split(/\s{2}/)[1])
  if (artifacts.length === 0) throw new Error('release manifest: checksums contain no artifacts')
  return {
    schemaVersion: 1,
    productVersion,
    qilinVersion: runtime.qilinVersion,
    qilinCommit: runtime.qilinCommit,
    sharedThemeVersion: brand.sharedThemeVersion,
    sync: { webBundleSha256: sync.webBundleSha256 },
    artifacts,
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]))) {
  const args = process.argv.slice(2)
  const brandIndex = args.indexOf('--brand')
  const brandPath = brandIndex === -1 ? undefined : args[brandIndex + 1]
  const positional = args.filter((arg, index) => !arg.startsWith('--') && index !== brandIndex + 1)
  const [runtimePath, syncPath, checksumsPath, outPath] = positional
  if (!runtimePath || !syncPath || !checksumsPath) {
    throw new Error('usage: generate-release-manifest.mjs <desktop-runtime.json> <sync-report.json> <checksums.txt> [manifestOut] [--brand <brand-manifest.json>]')
  }
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'))
  const productVersion = JSON.parse(await readFile('package/package.json', 'utf8')).version
  const manifest = buildManifest({
    runtime,
    productVersion,
    sync: JSON.parse(await readFile(syncPath, 'utf8')),
    checksums: await readFile(checksumsPath, 'utf8'),
    brand: brandPath === undefined ? undefined : JSON.parse(await readFile(brandPath, 'utf8')),
  })
  const out = outPath ?? 'releases/manifest.json'
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`release manifest written to ${out}`)
}
