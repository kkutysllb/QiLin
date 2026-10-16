import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vitest'
import { createSessionFormatCatalogWithChildren } from '@qilin-agent/session-format-catalog'

const ROOT = 'packages/experimental/webworker-runtime/tests/fixtures/vfs-example'

it('probes the preset across the restore paths', () => {
  for (const name of ['session.v3.jsonl', 'session.v5.jsonl']) {
    const p = join(ROOT, 'home/sessions/--qilin-workspace--/preview-showcase', name)
    let content: string
    try { content = readFileSync(p, 'utf8') } catch { console.log(name, 'MISSING'); continue }
    const [header, ...events] = content.trimEnd().split('\n').map(l => JSON.parse(l) as unknown)
    const restore = createSessionFormatCatalogWithChildren([]).createRestore(header, { recovery: 'strict', validation: 'current' })
    for (const event of events) restore.decodeRow(event)
    const finished = restore.finish() as { header: Record<string, unknown> }
    console.log(name, '-> agentPreset:', finished.header.agentPreset, '| input header preset:', (header as Record<string, unknown>).agentPreset)
  }
})
