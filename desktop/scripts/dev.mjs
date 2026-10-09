// scripts/dev.mjs
/**
 * Launch the branded native desktop dev environment from this product repo
 * (2026-10-07 native design: Electron shell + engine host subprocess):
 *
 *   1. prepare the branded upstream checkout at .tmp/dev/qilin-src — reused
 *      as-is when its stamp still matches the lock and the branding inputs
 *      (protecting node_modules and build artifacts from the destructive
 *      re-clone); otherwise fetch the locked commit and apply branding;
 *   2. make sure the runtime artifacts exist (apps/cli/lib/profile-boot.js +
 *      apps/web/dist) — the host boots the engine programmatically from
 *      them — building via the upstream toolchain when missing;
 *   3. make sure a self-managed Electron binary exists at
 *      .tmp/dev/electron-tool (upstream apps/desktop is gone in 3.1.x, the
 *      shell owns its Electron now);
 *   4. spawn the OpenKylin desktop shell, which starts the engine host
 *      (Electron-as-Node, programmatic `runProfile` boot) and serves the
 *      web client over the qilin-app:// privileged protocol.
 *
 * The user's QiLin working tree is never modified.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile as writeFilePromise } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchUpstream } from './fetch-upstream.mjs'
import { applyBranding } from './apply-branding.mjs'
import { DEV_STAMP_FILE, brandingFingerprint, checkoutReusable } from './lib/dev-stamp.mjs'
const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const lock = JSON.parse(readFileSync(join(repoRoot, 'upstream/qilin.lock.json'), 'utf8'))
const sourceRoot = resolve(repoRoot, process.env.OPENKYLIN_QILIN_SRC ?? '../QiLin')
const cloneRoot = join(repoRoot, '.tmp', 'dev', 'qilin-src')

if (!existsSync(join(sourceRoot, 'package.json'))) {
  throw new Error(`dev: upstream source not found at ${sourceRoot} (set OPENKYLIN_QILIN_SRC)`)
}

/** Run a child step to completion; throw on non-zero exit. */
async function runStep(command, args, options = {}) {
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ...options.env },
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    child.on('error', reject)
    child.on('exit', c => { resolveExit(c ?? 1) })
  })
  if (code !== 0) throw new Error(`dev: ${command} ${args.join(' ')} exited with ${code}`)
}

/** Runtime artifacts the host boots from (upstream canonical product build). */
const PROFILE_BOOT = join('apps', 'cli', 'lib', 'profile-boot.js')
const WEB_DIST_INDEX = join('apps', 'web', 'dist', 'index.html')
/** Dev Electron tool checkout（产品仓零依赖：Electron 装进 .tmp，不入 package.json）。 */
const ELECTRON_TOOL = join(repoRoot, '.tmp', 'dev', 'electron-tool')
// 必须钉死精确版本：QiLin 的原生加载器（node-addon-require-builtin）按
// Electron 精确指纹校验（当前支持 43.0.0 / 44.0.0 / 45.0.0-alpha.6），
// 浮动 ^44 会装到 44.x.y 而在宿主 boot 时被拒。
const ELECTRON_SPEC = process.env.OPENKYLIN_ELECTRON_SPEC ?? '44.0.0'

// 1. Branded checkout: reuse when the stamp matches, rebuild otherwise.
if (checkoutReusable(lock, repoRoot, cloneRoot)) {
  console.log(`dev: reusing branded checkout at ${cloneRoot} (stamp matches lock ${lock.qilinCommit.slice(0, 12)})`)
} else {
  console.log(`dev: preparing branded checkout at ${cloneRoot} …`)
  // fetchUpstream removes any previous checkout before cloning the locked commit.
  await fetchUpstream({ repository: sourceRoot, commit: lock.qilinCommit, qilinVersion: lock.qilinVersion, out: cloneRoot })
  const registry = JSON.parse(readFileSync(join(repoRoot, 'patches/registry.json'), 'utf8'))
  await applyBranding({ productRoot: repoRoot, upstreamRoot: cloneRoot, registry })
  await writeFilePromise(
    join(cloneRoot, DEV_STAMP_FILE),
    `${JSON.stringify({ commit: lock.qilinCommit, brandingFingerprint: brandingFingerprint(repoRoot) }, null, 2)}\n`,
  )
}

// 2. Ensure the host-bootable runtime artifacts exist. Artifacts are built
//    through the upstream canonical product build (`build:qilin` = native +
//    build:lib + build:web with the bound client environment) so baked public
//    values — the version badge, commit, build profile — match the product
//    surface this shell serves. CI=true lets the first-run dependency
//    install proceed without a TTY.
const missing = [PROFILE_BOOT, WEB_DIST_INDEX].filter(rel => !existsSync(join(cloneRoot, rel)))
if (missing.length > 0) {
  console.log(`dev: building missing runtime artifacts (${missing.join(', ')}) …`)
  const pnpm = process.env.OPENKYLIN_PNPM ?? 'pnpm'
  await runStep(pnpm, ['install'], { cwd: cloneRoot, env: { CI: 'true' } })
  await runStep(pnpm, ['run', 'build:qilin'], { cwd: cloneRoot, env: { CI: 'true' } })
}

// 3. Self-managed dev Electron (dsh pins ^44; the shell owns its binary now).
//    Lives in its own tool checkout with a private package.json so npm never
//    walks up into the product repo. The npm shim exists even when its
//    binary was never downloaded (postinstall skipped), so verify the dist
//    and run electron's own installer (mirror-friendly) when missing.
function ensureElectronToolPackage() {
  const pkgPath = join(ELECTRON_TOOL, 'package.json')
  if (!existsSync(pkgPath)) {
    mkdirSync(ELECTRON_TOOL, { recursive: true })
    writeFileSync(pkgPath, `${JSON.stringify({ name: 'openkylin-dev-electron', private: true, version: '0.0.0' }, null, 2)}\n`)
  }
}

function electronDistReady() {
  const pkgDir = join(ELECTRON_TOOL, 'node_modules', 'electron')
  return { pkgDir, bin: join(ELECTRON_TOOL, 'node_modules', '.bin', 'electron'), ready: existsSync(join(pkgDir, 'path.txt')) }
}

let electronBin = process.env.OPENKYLIN_ELECTRON
if (electronBin !== undefined && electronBin !== '') {
  console.log(`dev: using OPENKYLIN_ELECTRON at ${electronBin}`)
} else {
  ensureElectronToolPackage()
  let dist = electronDistReady()
  if (!existsSync(join(dist.pkgDir, 'package.json'))) {
    console.log(`dev: installing dev Electron (${ELECTRON_SPEC}) into .tmp/dev/electron-tool …`)
    await runStep('npm', ['install', '--no-save', '--loglevel=error', `electron@${ELECTRON_SPEC}`], { cwd: ELECTRON_TOOL })
    dist = electronDistReady()
  }
  if (!dist.ready) {
    if (!existsSync(join(dist.pkgDir, 'install.js'))) {
      throw new Error(
        `dev: Electron package incomplete at ${dist.pkgDir}; `
        + 'delete .tmp/dev/electron-tool and retry, or set OPENKYLIN_ELECTRON.',
      )
    }
    console.log('dev: Electron binary not downloaded yet; running electron install.js …')
    await runStep('node', ['install.js'], {
      cwd: dist.pkgDir,
      env: { CI: 'true', ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/' },
    })
    dist = electronDistReady()
    if (!dist.ready) {
      throw new Error('dev: electron install.js finished but no dist landed; check network or set ELECTRON_MIRROR')
    }
  }
  electronBin = dist.bin
}

// 4. Run the OpenKylin desktop shell: it spawns the engine host (Electron
//    as Node, programmatic product-profile boot) and serves the very same
//    web build over the qilin-app:// protocol (web/desktop parity by
//    construction, no open listening surface beyond the host loopback).
//    OPENKYLIN_ELECTRON_NO_GPU=1 appends --disable-gpu for headless/CPU-only
//    runners; normal desktop terminals leave it unset.
const shellEntry = join(repoRoot, 'desktop', 'main', 'index.mjs')
const electronArgs = [shellEntry]
if (process.env.OPENKYLIN_ELECTRON_NO_GPU === '1') electronArgs.push('--disable-gpu')
// Extra Electron CLI switches for restricted environments, split on whitespace
// (e.g. OPENKYLIN_ELECTRON_ARGS="--remote-debugging-port=9333").
if (process.env.OPENKYLIN_ELECTRON_ARGS !== undefined && process.env.OPENKYLIN_ELECTRON_ARGS.trim() !== '') {
  electronArgs.push(...process.env.OPENKYLIN_ELECTRON_ARGS.trim().split(/\s+/))
}
console.log(`dev: starting OpenKylin desktop shell\n  electron: ${electronBin}\n  entry:    ${shellEntry}\n  run root: ${cloneRoot}`)
const child = spawn(electronBin, electronArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    OPENKYLIN_QILIN_RUN: cloneRoot,
    ELECTRON_RUN_AS_NODE: undefined,
  },
})
child.on('exit', code => { process.exitCode = code ?? 1 })
