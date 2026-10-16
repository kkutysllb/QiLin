import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, resolve as resolvePath, sep } from 'node:path'
import type { UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

const bundle = clientBundle('@qilin-agent/client-ui-plugin-manager', ['lib/types/index.js'], { hostPhase: true })

/** The package's preview illustrations become base64 data URLs embedded in its own bundle. */
const IMAGE_MEDIA_TYPES = new Map([['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webp', 'image/webp']])

/** Path segment separating a package's tsc output from the sources it was emitted from. */
const TYPES_MARKER = `${sep}lib${sep}types${sep}`

/**
 * Resolve an illustration against the sources it was emitted from: the client
 * entry may be the tsc output under `lib/types`, which carries no assets of its
 * own. The shared preset handles the same mapping for stylesheets.
 * @param source - relative import specifier as written in the source.
 * @param importer - absolute path of the importing module.
 * @returns the illustration on disk.
 */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const boundary = emitted.indexOf(TYPES_MARKER)
  /* v8 ignore next -- an illustration always lives under the package sources */
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + TYPES_MARKER.length))
}

/** Inline illustrations into the client bundle, so the artifact ships no unresolved asset request. */
const illustrationDataUrls: NonNullable<UserConfig['plugins']> = [{
  name: 'qilin-plugin-manager-illustrations',
  resolveId(source: string, importer: string | undefined) {
    if (importer === undefined || !IMAGE_MEDIA_TYPES.has(extname(source))) return null
    return sourceAssetPath(source, importer)
  },
  async load(this: { addWatchFile: (id: string) => void }, id: string) {
    const mediaType = IMAGE_MEDIA_TYPES.get(extname(id))
    if (mediaType === undefined) return null
    this.addWatchFile(id)
    const data = await readFile(id)
    return `export default ${JSON.stringify(`data:${mediaType};base64,${data.toString('base64')}`)};`
  },
}]

export default (options: Parameters<typeof bundle>[0]): UserConfig[] => bundle(options).map(config =>
  config.name?.endsWith('/client') === true
    ? { ...config, plugins: [config.plugins, illustrationDataUrls] }
    : config,
)
