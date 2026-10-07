// desktop/main/recovery.mjs
/**
 * 致命错误恢复（M3.3）：禁用第三方插件。
 *
 * 宿主 fatal 的常见根因是用户安装的第三方插件（第三方 bundle 在 profile
 * 装配期抛错）。恢复手段镜像上游插件页的开关语义：插件的启停就是
 * profile manifest 的 bundles 列表增删（packages/boot/plugin-manager/
 * src/index.ts:288 读、app-boot writeProfileManifest 写）——壳侧用纯
 * fs/JSON 重写该列表为出厂模板面，不 import 可能已损坏的运行树。
 *
 * 已安装插件（dependencies 字段）原样保留，只是不再装配；用户可在
 * 插件页重新启用。恢复前整份 manifest 备份为 package.json.pre-recovery
 * （滚动覆盖），误操作可手工还原。
 *
 * 本模块保持 Electron 无关（纯 fs/JSON），产品层测试可直接导入。
 *
 * @module desktop/main/recovery
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { qilinHome } from './qilin-contract.mjs'

/** 产品出厂插件面（上游 PROFILE_TEMPLATES['qilin'].bundles，
 * packages/boot/app-boot/src/profile.ts:252）。 */
export const SHIPPED_PROFILE_BUNDLES = Object.freeze(['@qilin/base', '@qilin/web-app', '@qilin/web-brand'])

/** 产品 profile 名（runProfile 的 profile: 'qilin'）。 */
export const PROFILE_NAME = 'qilin'

/** 崩溃报告保留份数上限（报告落盘在主进程 index.mjs，上限随域放这里）。 */
export const CRASH_REPORT_KEEP = 10

/**
 * profile manifest 路径（resolveProfileDir 语义：$QILIN_HOME/profiles/
 * <name>/package.json，packages/boot/app-boot/src/profile.ts:234）。
 *
 * @param {string} [home] - QILIN_HOME（缺省 qilinHome()）。
 * @returns {string}
 */
export function profileManifestPath(home = qilinHome()) {
  return join(home, 'profiles', PROFILE_NAME, 'package.json')
}

/**
 * @typedef {{ changed: boolean, removed: string[], backupPath: string | null, error: string | null }} RecoveryResult
 */

/**
 * 恢复出厂插件面：把启用的 bundles 重写为出厂模板层（旧 dsh face 同样
 * 认得——上游 profileDeclarationOf 的 qilin 优先、dsh 兜底次序），其余
 * 字段全部保留。没有 manifest（首次启动即 fatal）或没有 bundles 面
 * （无可禁用项）时 changed: false 且不报错。
 *
 * @param {string} [home] - QILIN_HOME（缺省 qilinHome()）。
 * @returns {RecoveryResult}
 */
export function restoreShippedBundles(home = qilinHome()) {
  const manifestPath = profileManifestPath(home)
  /** @type {RecoveryResult} */
  const result = { changed: false, removed: [], backupPath: null, error: null }
  /** @type {any} */
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return result
    result.error = `读取 profile manifest 失败：${String(error)}`
    return result
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    result.error = 'profile manifest 不是 JSON 对象，无法自动恢复'
    return result
  }
  const face = manifest.qilin?.profile !== undefined ? 'qilin' : 'dsh'
  const profile = manifest[face]?.profile
  if (profile === null || typeof profile !== 'object' || !Array.isArray(profile?.bundles)) {
    return result
  }
  const shipped = new Set(SHIPPED_PROFILE_BUNDLES)
  const removed = profile.bundles.filter((name) => !shipped.has(name))
  if (removed.length === 0) return result
  try {
    const backupPath = `${manifestPath}.pre-recovery`
    writeFileSync(backupPath, `${JSON.stringify(manifest, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    profile.bundles = [...SHIPPED_PROFILE_BUNDLES]
    writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    result.changed = true
    result.removed = removed
    result.backupPath = backupPath
  } catch (error) {
    result.error = `写回 profile manifest 失败：${String(error)}`
  }
  return result
}
