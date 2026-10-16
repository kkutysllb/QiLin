/**
 * DSH plugin ecosystem compatibility for QiLin: module-name aliases and
 * manifest-key fallback readers. See {@link ./aliases.ts} and
 * {@link ./manifest.ts}.
 * @module @qilin-agent/dsh-compat
 */

export {
  DSH_APPLICATION_MODULE_ALIASES,
  DSH_PLATFORM_MODULE_ALIASES,
  dshCompatAliasOf,
  dshCompatModuleId,
} from './aliases.ts'
export {
  bundlePatchFilesOf,
  bundlePatchOf,
  clientDeclarationOf,
  type ClientDeclaration,
  type ClientDeclarationKey,
} from './manifest.ts'
