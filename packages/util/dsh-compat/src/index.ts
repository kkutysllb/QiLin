/**
 * DSH plugin ecosystem compatibility for QiLin: module-name aliases and
 * manifest-key fallback readers. See {@link ./aliases.ts} and
 * {@link ./manifest.ts}.
 * @module @qilin/dsh-compat
 */

export {
  DSH_PLATFORM_MODULE_ALIASES,
  dshCompatModuleId,
} from './aliases.ts'
export {
  bundlePatchOf,
  clientDeclarationOf,
  type ClientDeclaration,
  type ClientDeclarationKey,
} from './manifest.ts'
