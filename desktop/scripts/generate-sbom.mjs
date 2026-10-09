// scripts/generate-sbom.mjs
/** Emit an SPDX 2.3 JSON SBOM for the materialized desktop runtime tree. */
import { readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** Recursively discover npm packages in a materialized node_modules tree. */
export async function collectPackages(runtimeDir) {
  const found = []
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      if (name === '.bin' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (!(await stat(path)).isDirectory()) continue
      if (name.startsWith('@')) { await walk(path); continue }
      try {
        const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
        if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
          found.push({ name: pkg.name, version: pkg.version, license: typeof pkg.license === 'string' ? pkg.license : null })
        }
      } catch (error) {
        // A directory without a readable package manifest is not an npm package.
        if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') throw error
      }
      try {
        const nested = join(path, 'node_modules')
        if ((await stat(nested)).isDirectory()) await walk(nested)
      } catch { /* no nested dependencies */ }
    }
  }
  try { await walk(join(runtimeDir, 'node_modules')) } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`sbom: no node_modules under ${runtimeDir}`)
    throw error
  }
  const seen = new Set()
  return found
    .filter(p => !seen.has(`${p.name}\0${p.version}`) && seen.add(`${p.name}\0${p.version}`))
    .sort((a, b) => `${a.name}\0${a.version}`.localeCompare(`${b.name}\0${b.version}`))
}

export function buildSbom({ packages, product, versions, created }) {
  // Deduplicate and normalize order independently of caller input, matching collectPackages.
  const unique = [...new Map(packages.map(p => [`${p.name}\0${p.version}`, p])).values()]
    .sort((a, b) => `${a.name}\0${a.version}`.localeCompare(`${b.name}\0${b.version}`))
  const components = []
  for (const pkg of unique) {
    components.push({
      SPDXID: `SPDXRef-Package-${String(components.length)}`,
      name: pkg.name,
      versionInfo: pkg.version,
      downloadLocation: 'NOASSERTION',
      licenseConcluded: pkg.license ?? 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      externalRefs: [{
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        // npm purl convention: decode '@' to %40 but keep the scope separator.
        referenceLocator: `pkg:npm/${pkg.name.startsWith('@') ? `%40${pkg.name.slice(1)}` : pkg.name}@${pkg.version}`,
      }],
    })
  }
  const productNode = {
    SPDXID: 'SPDXRef-OpenKylin-Desktop',
    name: 'OpenKylin Desktop',
    versionInfo: product.productVersion,
    downloadLocation: 'NOASSERTION',
    licenseConcluded: 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    sourceInfo: `bundled runtime: qilin ${product.qilinVersion} @ ${product.qilinCommit}; node ${versions.node}; pnpm ${versions.pnpm}`,
  }
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `QiLin Desktop ${product.productVersion} (mac-arm64)`,
    documentNamespace: `https://github.com/kkutysllb/QiLin/sbom/${product.productVersion}`,
    creationInfo: { creators: ['Organization: OpenKylin'], created },
    documentDescribes: ['SPDXRef-OpenKylin-Desktop'],
    packages: [productNode, ...components],
    relationships: [{ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: 'SPDXRef-OpenKylin-Desktop' }],
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]))) {
  const args = process.argv.slice(2)
  const versionsIndex = args.indexOf('--versions')
  const versionsPath = versionsIndex === -1 ? undefined : args[versionsIndex + 1]
  const positional = args.filter((arg, index) =>
    !arg.startsWith('--') && (versionsIndex === -1 || index !== versionsIndex + 1))
  const [runtimeDir, runtimeJsonPath, outPath] = positional
  if (!runtimeDir || !runtimeJsonPath || !outPath) {
    throw new Error('usage: generate-sbom.mjs <runtimeDir> <desktop-runtime.json> <out.spdx.json> [--versions <versions.json>]')
  }
  const runtime = JSON.parse(await readFile(runtimeJsonPath, 'utf8'))
  const product = {
    productVersion: JSON.parse(await readFile(join(process.cwd(), '..', 'package.json'), 'utf8')).version,
    qilinVersion: runtime.qilinVersion,
    qilinCommit: runtime.qilinCommit,
  }
  const versions = versionsPath
    ? JSON.parse(await readFile(versionsPath, 'utf8'))
    : { node: 'unknown', pnpm: 'unknown' }
  const doc = buildSbom({ packages: await collectPackages(runtimeDir), product, versions, created: new Date().toISOString() })
  await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`sbom written: ${String(doc.packages.length - 1)} component package(s)`)
}
