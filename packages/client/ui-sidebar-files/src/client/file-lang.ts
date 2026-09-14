/**
 * Language grammar for one file path, as the editor mounts it.
 *
 * The map covers the installed `@codemirror/lang-*` packages plus the legacy
 * modes worth carrying for shell-family and config files; an unmapped path
 * edits as plain text.
 * @module
 */
import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { rust } from '@codemirror/lang-rust'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { go } from '@codemirror/legacy-modes/mode/go'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { r } from '@codemirror/legacy-modes/mode/r'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { cmake } from '@codemirror/legacy-modes/mode/cmake'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { extensionOf } from '@qilin/util-workspace-path'

/** The lower-case extension each legacy mode serves. */
const LEGACY_MODES: Readonly<Record<string, () => Extension>> = {
  sh: () => StreamLanguage.define(shell),
  bash: () => StreamLanguage.define(shell),
  zsh: () => StreamLanguage.define(shell),
  fish: () => StreamLanguage.define(shell),
  ksh: () => StreamLanguage.define(shell),
  csh: () => StreamLanguage.define(shell),
  ps1: () => StreamLanguage.define(powerShell),
  psd1: () => StreamLanguage.define(powerShell),
  psm1: () => StreamLanguage.define(powerShell),
  toml: () => StreamLanguage.define(toml),
  go: () => StreamLanguage.define(go),
  rb: () => StreamLanguage.define(ruby),
  pl: () => StreamLanguage.define(perl),
  pm: () => StreamLanguage.define(perl),
  lua: () => StreamLanguage.define(lua),
  r: () => StreamLanguage.define(r),
  swift: () => StreamLanguage.define(swift),
  cmake: () => StreamLanguage.define(cmake),
  mk: () => StreamLanguage.define(cmake),
  ini: () => StreamLanguage.define(properties),
  cfg: () => StreamLanguage.define(properties),
  conf: () => StreamLanguage.define(properties),
  properties: () => StreamLanguage.define(properties),
  env: () => StreamLanguage.define(properties),
  diff: () => StreamLanguage.define(diff),
  patch: () => StreamLanguage.define(diff),
}

/**
 * The grammar for one file path, from its extension.
 * @param path - the path the Host receives.
 * @returns the language extension, or `undefined` for a path edited as plain text.
 */
export function langForPath(path: string): Extension | undefined {
  switch (extensionOf(path)) {
    case 'js': case 'mjs': case 'cjs': return javascript()
    case 'jsx': return javascript({ jsx: true })
    case 'ts': case 'mts': case 'cts': return javascript({ typescript: true })
    case 'tsx': return javascript({ typescript: true, jsx: true })
    case 'json': case 'jsonc': case 'json5': return json()
    case 'md': case 'markdown': case 'mdx': return markdown()
    case 'py': case 'pyi': case 'pyw': return python()
    case 'css': case 'scss': case 'sass': case 'less': return css()
    case 'html': case 'htm': return html()
    case 'rs': return rust()
    case 'java': return java()
    case 'c': case 'h': case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hh': case 'hxx': return cpp()
    case 'sql': return sql()
    case 'xml': case 'xsl': case 'xslt': case 'xsd': case 'dtd': case 'plist': return xml()
    case 'yaml': case 'yml': return yaml()
    default: return LEGACY_MODES[extensionOf(path)]?.()
  }
}
