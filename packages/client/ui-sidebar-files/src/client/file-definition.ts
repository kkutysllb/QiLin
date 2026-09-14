/**
 * Stage one of the `file` tab type's registration: the workspace file editor.
 *
 * A resource type in the `builtin` band claiming every session-scoped file
 * address `file-guard` accepts — text and code extensions only, so images,
 * PDFs, markdown, and unknown extensions fall through to the `text` fallback
 * viewer. One tab opens per address: the registry's default, and the reason
 * the type declares no `single` and no guide entry.
 */
import type { SidebarRightTabDefinition } from '@qilin/client-ui-sidebar-right/client'
import type { TranslateNS } from '@qilin/client-locale/client'
import { canOpenFileAddress, fileTabTitle } from './file-guard.ts'
import type {} from './locales.ts'

/** The editor tab kind this package owns beside the `files` page. */
export const FILE_KIND = 'file'

/** This implementation's identity, and the key its body and title register under. */
export const FILE_ID = '@qilin/client-ui-sidebar-files/file'

/**
 * The editor type's registry definition.
 *
 * No static `icon`: the chip's glyph comes from the title slot, which draws
 * the file-type sheet for the open file's own name — a static type glyph here
 * could not classify by path and would double the chip's sheet.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function fileDefinition(t: TranslateNS<'sidebarFiles'>): SidebarRightTabDefinition {
  return {
    id: FILE_ID,
    kind: FILE_KIND,
    priority: 'builtin',
    patterns: ['qilin-resource://file/**'],
    canOpen: canOpenFileAddress,
    label: () => t('file.type.label'),
    title: fileTabTitle,
  }
}
