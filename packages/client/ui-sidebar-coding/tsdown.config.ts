/**
 * Build for the coding workbench (ported from dsh-coding-sidebar's own
 * tsdown config, QiLin-channel adapted). Four artifact families from one
 * source tree:
 *
 * - `lib/index.js` + `lib/invariant.js` — the Node half (ESM; routes, pty,
 *   git, fs services), types from tsc under `lib/types`.
 * - `lib/client.js` — the core browser bundle: a CJS closure factory
 *   registered through `window.__ModuleLoader__.load({ id, factory })`, the
 *   module-table shape every dynamic QiLin client row ships. Externals
 *   resolve through the injected require (the platform table — react and
 *   the two baseline ui libraries); everything else inlines.
 * - `lib/client-<name>.js` — six lazy chunk bundles (terminal, editor,
 *   locale, trajectory, mermaid, office): the heavy preview/terminal
 *   libraries as standalone single scripts, fetched by the client on first
 *   use through the package's own `/sidebar/bundle` route. Chunks
 *   deliberately do NOT register with the module loader (a chunk id is not
 *   a seed word, a shell module, or a boot-graph row); each assigns its
 *   factory to the package-owned `globalThis.__qilinChunks__[<name>]` and
 *   the loader (src/client/chunk-loader.ts) materializes it with a require
 *   built from the module table's seed words. `codeSplitting: false` keeps
 *   every artifact one script; the core bundle never statically imports a
 *   chunk entry.
 *
 * Both browser faces carry the client-bundle purity gate: Node builtins and
 * non-inline-safe `@qilin/*` value imports fail the build — cross-plugin
 * collaboration goes through cordis services, never value imports
 * (type-only imports are erased and never reach the gate).
 */
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve as resolvePath, sep } from 'node:path'
import { builtinModules, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { INLINE_SAFE, clientOnly } from '../tsdown.client.ts'

const require = createRequire(import.meta.url)

/** The package version, injected as `__SIDEBAR_VERSION__` into every client bundle. */
const PKG_VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

/** The browser bundle id: the package name (client-modules composes keys on it). */
const PLUGIN_ID = '@qilin/client-ui-sidebar-coding'

/** Build mode is explicit-only: environment NODE_ENV never reaches a byte. */
const BUILD_MODE = process.env.QILIN_SIDEBAR_BUILD_MODE === 'development' ? 'development' : 'production'

/** Node builtins must never survive into a browser bundle. */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(id => `node:${id}`),
])

/** Module specifiers the web shell shares into the platform module table. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@qilin/kylin',
  '@qilin/client-ui-slots',
  '@qilin/client-ui-primitives',
]

/**
 * react-icons' exports map lists `require` BEFORE `import`, so shared
 * conditionNames resolve the unshakable CJS entry and the whole icon set
 * lands in the core bundle (~6.4 MB extra). Pin the two sets the client
 * uses to their ESM entries, which tree-shake down to the imported icons.
 */
const reactIconsRoot = dirname(dirname(require.resolve('react-icons/lib')))
const REACT_ICONS_ESM_ALIAS = {
  'react-icons/si': join(reactIconsRoot, 'si/index.mjs'),
  'react-icons/vsc': join(reactIconsRoot, 'vsc/index.mjs'),
}

/** Vendored libraries (re-entered under @deepseek-ai) may inline wholesale. */
const VENDORED_LIBRARY = /^@qilin\/(cosmokit|schemastery)(\/|$)/

const CSS_VIRTUAL_PREFIX = '\0qilin-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** The package root (sourcemap rebasing anchor). */
const PACKAGE_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** The style-injection prologue shared by module css and plain css loads. */
function injectTag(pluginId: string, fileId: string, cssText: string): string {
  const tagId = `${pluginId}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(cssText)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ].join('\n')
}

/** Rebase a physical lib-relative source onto the package-relative URL tree. */
function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  const packagePath = relative(PACKAGE_ROOT, physicalSource).split(sep).join('/')
  return `../${packagePath}`
}

/**
 * One browser bundle build. The same closure-factory shape the shared preset
 * emits; kept local because the chunk families and the purity gate ride the
 * same plugin set.
 * @param entryFile - the output file name under lib/.
 * @param chunkName - absent for the core bundle (module-loader registered);
 *   present for a lazy chunk (`__qilinChunks__` registered).
 */
function browserBundle(entryFile: string, chunkName?: string): UserConfig {
  return {
    // The notices collector and the build faces identify the core browser
    // bundle by `<package>/client`; chunks follow the same convention.
    name: chunkName === undefined ? `${PLUGIN_ID}/client` : `${PLUGIN_ID}/client-${chunkName}`,
    entry: chunkName === undefined
      ? { client: 'src/client/index.tsx' }
      : { [chunkName]: `src/client/chunks/${chunkName}.tsx` },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(BUILD_MODE),
      'import.meta.env.MODE': JSON.stringify(BUILD_MODE),
      'import.meta.env': JSON.stringify({ MODE: BUILD_MODE }),
      '__SIDEBAR_VERSION__': JSON.stringify(PKG_VERSION),
      // No bundled chunk uses import.meta.resolve; keep the stub so a stray
      // reference cannot resolve to Node's loader (browser CJS has none).
      'import.meta.resolve': 'undefined',
    },
    // CJS output otherwise makes some transitive packages resolve their
    // Node entry even though this bundle runs in the browser. Keep browser
    // conditional exports authoritative for both source import() and
    // generated require() edges.
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
        alias: chunkName === undefined ? REACT_ICONS_ESM_ALIAS : undefined,
      },
    },
    // External wins for module-table entries; every other dependency inlines.
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [
      purityGatePlugin(),
      makeCssPlugin(PLUGIN_ID),
      ...(chunkName === 'mermaid' ? [mermaidChunkAliases()] : []),
      ...(chunkName === 'office' ? [officeChunkAliases()] : []),
    ],
    outputOptions: {
      entryFileNames: entryFile,
      sourcemapPathTransform: browserSourcePath,
      banner: chunkName === undefined
        ? `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`
        : `globalThis.__qilinChunks__ = globalThis.__qilinChunks__ || {}; globalThis.__qilinChunks__[${JSON.stringify(chunkName)}] = (require) => {`,
      footer: chunkName === undefined ? 'return module.exports; } });' : 'return module.exports; };',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      // The CJS wrapper factory's `require` only resolves module-table entries;
      // it cannot load relative chunk URLs in the browser. Disable code
      // splitting so every artifact is one script.
      codeSplitting: false,
    },
  }
}

/** A rolldown plugin as tsdown's config accepts it (contextual `this` for load/resolveId). */
type BuildPlugin = NonNullable<UserConfig['plugins']>

/**
 * Mermaid-chunk-only alias: pin uuid's BROWSER entry. The mermaid core
 * (mindmap definition) imports the bare `uuid` specifier, which rolldown
 * resolves to uuid's node entry — its dist-node modules import
 * `node:crypto` and trip the client purity gate. The browser entry
 * (uuid/dist/index.js, Web Crypto based) carries no Node builtins, so alias
 * the specifier there instead of special-casing the gate. Resolved relative
 * to mermaid's own dependency tree (pnpm/npm layout agnostic).
 */
function mermaidChunkAliases(): BuildPlugin {
  const uuidBrowserEntry = resolvePath(
    dirname(require.resolve('uuid/package.json', { paths: [dirname(require.resolve('mermaid/package.json'))] })),
    'dist/index.js',
  )
  return {
    name: 'qilin-mermaid-uuid-browser-alias',
    resolveId(source: string) {
      if (source === 'uuid') return uuidBrowserEntry
      return null
    },
  }
}

/**
 * Office-chunk-only aliases: pin the BROWSER entry of the two packages whose
 * package `browser` remaps Rolldown does not honour after CJS lowering.
 *
 * - `xlsx` (SheetJS) resolves its Node entry, whose `fs`/`crypto` requires
 *   trip the client purity gate — the browser build in `dist/` has none.
 * - `jszip` arrives through docx-preview and has the same problem; its
 *   browser bundle is resolved relative to docx-preview's own dependency
 *   tree (pnpm/npm layout agnostic).
 */
function officeChunkAliases(): BuildPlugin {
  const xlsxBrowserEntry = join(dirname(require.resolve('xlsx/package.json')), 'dist/xlsx.full.min.js')
  const jszipBrowserEntry = join(
    dirname(require.resolve('jszip/package.json', { paths: [dirname(require.resolve('docx-preview'))] })),
    'dist/jszip.min.js',
  )
  return {
    name: 'qilin-office-browser-aliases',
    resolveId(source: string) {
      if (source === 'xlsx') return xlsxBrowserEntry
      if (source === 'jszip') return jszipBrowserEntry
      return null
    },
  }
}

/** The shared client-bundle purity gate (see the module comment). */
function purityGatePlugin(): BuildPlugin {
  return {
    name: 'qilin-client-bundle-purity',
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(
          `client bundle purity: Node builtin "${source}" cannot run in the browser module table — `
          + 'select the dependency browser export or add an explicit browser implementation',
        )
      }
      if (!source.startsWith('@qilin/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null // platform module: external wins
      if (INLINE_SAFE.test(source)) return null // wire/type layer: inline is the point
      if (VENDORED_LIBRARY.test(source)) return null // vendored library: inline is the point
      throw new Error(
        `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) and not an inline-safe wire layer — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }
}

/** The shared CSS-inline virtual-module plugin (one <style data-plugin> per file). */
function makeCssPlugin(pluginId: string): BuildPlugin {
  return {
    name: 'qilin-css-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css')) return null
      // Relative/absolute paths resolve against the importer; bare
      // specifiers (e.g. '@xterm/xterm/css/xterm.css') resolve from the package.
      let abs: string
      if (source.startsWith('.') || source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)) {
        abs = importer === undefined ? source : resolvePath(dirname(importer), source)
      } else {
        abs = require.resolve(source)
      }
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      // CSS Modules (x.module.css) become hashed class maps; plain css
      // (xterm's stylesheet) is inlined verbatim.
      if (fileId.endsWith('.module.css')) {
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: `[hash]_[local]` },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        // Sort by local name: lightningcss's exports come back in a
        // nondeterministic order, which made every rebuild re-shuffle every
        // class map in every artifact. The hash prefix and the names are
        // unaffected — only the emitted key order, which nothing reads
        // positionally.
        const entries = Object.entries(cssExports ?? {})
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        for (const [local, exp] of entries) classMap[local] = exp.name
        return [
          injectTag(pluginId, fileId, code.toString()),
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      }
      return [
        injectTag(pluginId, fileId, source.toString('utf8')),
        'export default "";',
      ].join('\n')
    },
  }
}

/** The lazy chunk names (keep in sync with src/bundle-route.ts CHUNK_NAMES). */
const CHUNKS = ['terminal', 'editor', 'locale', 'trajectory', 'mermaid', 'office']

/** The Node half: routes, pty, git, and fs services (ESM; types come from tsc). */
const nodeLib: UserConfig = {
  entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  // clean stays off: the build removes lib/ wholesale before tsc, so a
  // tsdown clean here would wipe the lib/types declarations tsc just emitted.
  clean: false,
}

export default clientOnly([nodeLib, browserBundle('client.js'), ...CHUNKS.map(name => browserBundle(`client-${name}.js`, name))])
