/** Pack the materialized qilin runtime tree into the product's bundled runtime archive. */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'

const output = process.argv[2]
if (output === undefined || !resolve(output).endsWith('.tar.gz')) {
  throw new Error('pack-product-runtime-tar: pass the output .tar.gz path')
}
const paths = desktopTargetBuildPaths(resolveDesktopBuildTarget())
if (!existsSync(join(paths.qilin, 'package.json'))) {
  throw new Error(`pack-product-runtime-tar: runtime tree missing: ${paths.qilin}`)
}
const staging = `${resolve(output)}.staging`
rmSync(staging, { recursive: true, force: true })
mkdirSync(dirname(staging), { recursive: true })
try {
  // APFS clone: no second 390 MB copy, and pnpm virtual stores were already dereferenced.
  execFileSync('cp', ['-cR', paths.qilin, staging], { stdio: 'inherit' })
  const pnpmBin = join(paths.runtime, 'primary-runtime', 'dependencies', 'pnpm', 'bin')
  const toolsBin = join(staging, 'tools', 'pnpm', 'bin')
  mkdirSync(toolsBin, { recursive: true })
  for (const file of ['pnpm.cjs', 'pnpm.mjs']) {
    if (existsSync(join(pnpmBin, file))) copyFileSync(join(pnpmBin, file), join(toolsBin, file))
  }
  execFileSync('tar', ['-czf', resolve(output), '-C', staging, '.'], { stdio: 'inherit' })
} finally {
  rmSync(staging, { recursive: true, force: true })
}
console.log(`product runtime archive: ${resolve(output)}`)
