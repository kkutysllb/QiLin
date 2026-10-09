// desktop/main/runtime-install.mjs
/**
 * 引擎运行时树解析与首启解压（打包态）。
 *
 * dev 态：OPENKYLIN_QILIN_RUN（品牌化 checkout）或仓库 .tmp/dev/qilin-src。
 * 打包态：运行时闭包（scripts/build-runtime-bundle.sh 产物）随 extraResources
 * 分发（Contents/Resources/runtime/qilin-runtime.tar.gz + desktop-runtime.json），
 * 首次启动解压到 userData/runtime/<commit>/——commit 目录名 = 版本换版自然
 * 重装新树，旧树留存不冲突；解压前校验 tar 的 sha256 与清单一致。
 *
 * @module desktop/main/runtime-install
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** 产品仓库根（desktop/main 的上上级）；打包态此路径在 asar 内，仅 dev 用。 */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * 解析引擎运行树根（同步首查；打包态未解压时返回 null，由 ensureRuntimeTree 异步备妥）。
 * @param {{ isPackaged: boolean, userData: string, resourcesPath: string }} appLike
 * @returns {string | null}
 */
export function resolveRuntimeRoot(appLike) {
  const override = process.env.OPENKYLIN_QILIN_RUN
  if (override !== undefined && override !== '') return override
  if (appLike.isPackaged !== true) return join(REPO_ROOT, '.tmp', 'dev', 'qilin-src')
  const manifest = readPackagedManifest(appLike.resourcesPath)
  if (manifest === null) return null
  const dest = join(appLike.userData, 'runtime', manifest.qilinCommit)
  return existsSync(join(dest, manifest.entry)) ? dest : null
}

/**
 * 确保打包态运行树就位：未解压则校验清单 sha256 后解压（阻塞首次启动；
 * 解压失败抛错——无运行树无法 boot，宁可显式失败）。
 * @param {{ isPackaged: boolean, userData: string, resourcesPath: string }} appLike
 * @returns {Promise<string>} 运行树绝对路径。
 */
export async function ensureRuntimeTree(appLike) {
  const resolved = resolveRuntimeRoot(appLike)
  if (resolved !== null) return resolved
  if (appLike.isPackaged !== true) {
    throw new Error('runtime: dev 运行树缺失（先跑一次 npm run dev 构建品牌化 checkout）')
  }
  const manifest = readPackagedManifest(appLike.resourcesPath)
  if (manifest === null) {
    throw new Error(`runtime: 打包缺运行时闭包清单（${join(appLike.resourcesPath, 'runtime', 'desktop-runtime.json')}）`)
  }
  const tarPath = join(appLike.resourcesPath, 'runtime', manifest.bundle)
  const actual = sha256File(tarPath)
  if (actual !== manifest.sha256) {
    throw new Error(`runtime: 闭包 sha256 不符（${actual.slice(0, 16)} ≠ ${manifest.sha256.slice(0, 16)}）——安装包损坏`)
  }
  const dest = join(appLike.userData, 'runtime', manifest.qilinCommit)
  await run('mkdir', ['-p', dest])
  // bsdtar 解包保留 pnpm 相对 symlink（同构相对路径，解压后仍有效）
  await run('tar', ['-xzf', tarPath, '-C', dest])
  if (existsSync(join(dest, manifest.entry)) !== true) {
    throw new Error(`runtime: 闭包解压后缺入口 ${manifest.entry}`)
  }
  return dest
}

/** 读打包态封盘清单（resources/runtime/desktop-runtime.json）。 */
function readPackagedManifest(resourcesPath) {
  try {
    return JSON.parse(readFileSync(join(resourcesPath, 'runtime', 'desktop-runtime.json'), 'utf8'))
  } catch {
    return null
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
