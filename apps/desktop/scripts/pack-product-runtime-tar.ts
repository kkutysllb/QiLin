/** Pack the materialized qilin runtime tree into the product's bundled runtime archive. */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'

const output = process.argv[2]
if (output === undefined || !resolve(output).endsWith('.tar.gz')) {
  throw new Error('pack-product-runtime-tar: pass the output .tar.gz path')
}
const paths = desktopTargetBuildPaths(resolveDesktopBuildTarget())
if (!existsSync(join(paths.qilin, 'package.json'))) {
  throw new Error(`pack-product-runtime-tar: runtime tree missing: ${paths.qilin}`)
}
const staging = `${resolve(output)}.staging`
const MACH_O_MAGICS = new Set(['cafebabe', 'cafebabf', 'cefaedfe', 'cffaedfe', 'feedface', 'feedfacf', 'bebafeca', 'bfbafeca'])

/** Read the first four bytes; Mach-O 文件靠 magic 识别（不靠扩展名）。 */
function isMachO(path) {
  let descriptor
  try {
    descriptor = openSync(path, 'r')
    const header = Buffer.alloc(4)
    return readSync(descriptor, header, 0, 4, 0) === 4 && MACH_O_MAGICS.has(header.toString('hex'))
  } catch {
    return false
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/** 递归列出 staging 下所有普通文件（cp -cR 已解引用，这里没有软链）。 */
function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

/**
 * 产品运行时归档里的第三方 Mach-O（koffi / sherpa-onnx / libreoffice-kit 等）不在
 * inventoryDesktopRuntime 的签名清单里：只带 ad-hoc/linker 签名，公证会被拒
 * （"not signed with a valid Developer ID certificate" / "no secure timestamp"）。
 * 归档打包前在 staging 上补签一遍：Developer ID + secure timestamp + hardened runtime。
 */
function signStagingRuntime(identity) {
  const jit = join(import.meta.dirname, 'jit-entitlements.plist')
  const targets = walk(staging).filter(isMachO)
  let signed = 0
  for (const file of targets) {
    const needsJit = /(?:^|\/)node_modules\/(?:@deepseek-ai\/libreoffice-kit-darwin-[a-z0-9]+\/bin\/libreoffice-kit|.*\.node)$/u.test(file)
    execFileSync('codesign', [
      '--sign', identity, '--force', '--timestamp', '--options', 'runtime',
      ...(needsJit && existsSync(jit) ? ['--entitlements', jit] : []),
      file,
    ], { stdio: ['ignore', 'ignore', 'inherit'] })
    signed += 1
  }
  console.log(`product runtime archive: signed ${signed} Mach-O files in staging`)
}

try {
  // APFS clone: no second 390 MB copy, and pnpm virtual stores were already dereferenced.
  execFileSync('cp', ['-cR', paths.qilin, staging], { stdio: 'inherit' })
  const env = loadDesktopPackageEnvironment('darwin', process.env, join(import.meta.dirname, '..'))
  const identity = String(process.env.QILIN_DESKTOP_MACOS_SIGNING_IDENTITY ?? env.QILIN_DESKTOP_MACOS_SIGNING_IDENTITY ?? '').trim()
  if (process.env.QILIN_DESKTOP_SKIP_RUNTIME_ARCHIVE_SIGN === '1') {
    console.log('product runtime archive: staging signing skipped by QILIN_DESKTOP_SKIP_RUNTIME_ARCHIVE_SIGN=1')
  } else if (identity === '') {
    throw new Error('pack-product-runtime-tar: signing identity missing (QILIN_DESKTOP_MACOS_SIGNING_IDENTITY)')
  } else {
    signStagingRuntime(identity)
  }
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
