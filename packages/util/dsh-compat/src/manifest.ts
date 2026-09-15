/**
 * Manifest-key fallback readers for DSH-era plugin packages.
 *
 * A DSH plugin's `package.json` declares its Harness metadata under the `dsh`
 * key (`dsh.bundle.patch`, `dsh.client`); a QiLin-native package declares the
 * same shape under `qilin`. These readers pick the declaration a package
 * actually carries so the profile launcher and the client module system mount
 * either channel's packages unchanged. Each reader validates only its own
 * pick (string presence for the patch path); the owning consumer keeps its
 * full structural validation and error reporting.
 * @module @qilin/dsh-compat/manifest
 */

/** The loose manifest shape both channels declare their metadata under. */
interface ManifestWithChannels {
  readonly qilin?: { readonly bundle?: { readonly patch?: unknown }; readonly client?: unknown }
  readonly dsh?: { readonly bundle?: { readonly patch?: unknown }; readonly client?: unknown }
}

/**
 * The relative patch-file path a bundle package declares, from `qilin.bundle.patch`
 * when the package carries the native key and from `dsh.bundle.patch` otherwise.
 * A present-but-non-string declaration falls through to the other channel and
 * finally to `undefined`, so the caller's fail-loud path reports it.
 * @param manifest - the parsed `package.json` value of the bundle package.
 * @returns the declared patch path, or `undefined` when neither key declares one.
 */
export function bundlePatchOf(manifest: unknown): string | undefined {
  const channels = manifest as ManifestWithChannels | null | undefined
  if (typeof channels !== 'object' || channels === null) return undefined
  const qilin = channels.qilin?.bundle?.patch
  if (typeof qilin === 'string') return qilin
  const dsh = channels.dsh?.bundle?.patch
  if (typeof dsh === 'string') return dsh
  return undefined
}

/** Which manifest key supplied a client declaration. */
export type ClientDeclarationKey = 'qilin.client' | 'dsh.client'

/** One picked client declaration: the key that supplied it and its raw value. */
export interface ClientDeclaration {
  /** The manifest key the declaration was read from; consumers use it in diagnostics. */
  readonly key: ClientDeclarationKey
  /** The raw declaration value; the consumer's structural validation applies unchanged. */
  readonly value: unknown
}

/**
 * Pick a package's client declaration: `qilin.client` when present (the
 * native key wins for a package that carries both), else `dsh.client`.
 * @param manifest - the parsed `package.json` value of the package.
 * @returns the picked declaration, or `undefined` when neither key declares one.
 */
export function clientDeclarationOf(manifest: unknown): ClientDeclaration | undefined {
  const channels = manifest as ManifestWithChannels | null | undefined
  if (typeof channels !== 'object' || channels === null) return undefined
  const qilin = channels.qilin?.client
  if (qilin !== undefined) return { key: 'qilin.client', value: qilin }
  const dsh = channels.dsh?.client
  if (dsh !== undefined) return { key: 'dsh.client', value: dsh }
  return undefined
}
