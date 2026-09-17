import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { kylinConfigFiles } from './kylin-config-files.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('kylinConfigFiles', () => {
  it('finds Loader YAML without treating translation records as configs', () => {
    const root = mkdtempSync(join(tmpdir(), 'qilin-cordis-config-files-'))
    roots.push(root)
    for (const directory of ['.claude', 'apps/cli/config/examples', 'docs', 'node_modules/pkg', 'vendor/pkg']) {
      mkdirSync(join(root, directory), { recursive: true })
    }
    for (const file of [
      '.claude/hidden.kylin.yml',
      'docs/kylin-primer.i18n.yaml',
      'apps/cli/config/examples/agent.kylin.yaml',
      'apps/cli/config/examples/headless.kylin.yml',
      'node_modules/pkg/hidden.kylin.yml',
      'vendor/pkg/hidden.kylin.yml',
    ]) {
      writeFileSync(join(root, file), '[]\n')
    }

    expect(kylinConfigFiles(root)).toEqual([
      join('apps', 'cli', 'config', 'examples', 'agent.kylin.yaml'),
      join('apps', 'cli', 'config', 'examples', 'headless.kylin.yml'),
    ])
  })
})
