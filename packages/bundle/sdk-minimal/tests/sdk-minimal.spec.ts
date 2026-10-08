/** The standalone SDK-minimal bundle's complete declared Cordis tree. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@qilin-agent/kylin-plugin-include'

function packageName(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
}

describe('qilin-sdk-minimal bundle', () => {
  it('declares one standalone allowlisted tree with every row dependency', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      qilin?: { bundle?: { patch?: string } }
    }
    expect(manifest.qilin?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.qilin!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Array<{ id?: string; inject?: string[]; name?: string; config?: Record<string, unknown>; disabled?: unknown }> }>
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['sdk-app-startup', '@qilin-agent/sdk-app'],
      ['sdk-jsonrpc-server', '@qilin-agent/sdk-jsonrpc-server'],
      ['deepseek-llm-api-extensions', '@qilin-agent/deepseek-llm-api-extensions'],
      ['session-log-deepseek', '@qilin-agent/session-log-deepseek'],
      ['plugin-package-inventory-deepseek', '@qilin-agent/plugin-package-inventory-deepseek'],
      ['llm-deepseek', '@qilin-agent/llm-deepseek-api-key'],
      ['sandbox', '@qilin-agent/sandbox-local'],
      ['session-projection', '@qilin-agent/session-projection'],
      ['sandbox-policy', '@qilin-agent/sandbox-policy'],
      ['subprocess', '@qilin-agent/subprocess-local'],
      ['pty', '@qilin-agent/terminal'],
      ['terminal-bash', '@qilin-agent/terminal-bash'],
      ['terminal-pwsh', '@qilin-agent/terminal-bash'],
      ['timer', '@qilin-agent/kylin-plugin-timer'],
      ['llm', '@qilin-agent/llm'],
      ['session', '@qilin-agent/session'],
      ['session-title', '@qilin-agent/session-title'],
      ['system-prompt', '@qilin-agent/system-prompt'],
      ['tools', '@qilin-agent/tools'],
      ['mcp-resources', '@qilin-agent/mcp-resources'],
      ['agent', '@qilin-agent/agent'],
      ['llm-retry', '@qilin-agent/llm-retry'],
      ['jobs', '@qilin-agent/jobs-local'],
      ['agent-loop', '@qilin-agent/agent-loop'],
      ['persistent-bash', '@qilin-agent/tool-bash-persistent'],
      ['persistent-pwsh', '@qilin-agent/tool-pwsh-persistent'],
      ['sessions', '@qilin-agent/session-persistence-jsonl'],
    ])
    expect(rows.find(row => row.id === 'sdk-app-startup')?.config).toEqual({ profile: 'sdk-minimal' })
    expect(rows.find(row => row.id === 'sdk-jsonrpc-server')).toMatchObject({
      inject: ['sdkAppStartup', 'loader'],
      config: { maxTokensAsSuccess: false },
    })
    expect(rows.find(row => row.id === 'llm-deepseek')?.config).toEqual({
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      defaultContextWindow: { __jsExpr: 'Number(process.env.QILIN_CONTEXT_WINDOW ?? 1000000)' },
      streamIdleTimeoutMs: 172800000,
    })
    expect(rows.find(row => row.id === 'system-prompt')?.config).toEqual({
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix: { __jsExpr: "process.env.QILIN_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'" },
    })
    expect(rows.find(row => row.id === 'agent-loop')?.config).toEqual({ agents: [] })
    expect(rows.find(row => row.id === 'terminal-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
    })
    expect(rows.find(row => row.id === 'terminal-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      [...new Set(rows.map(row => row.name).filter((name): name is string => name !== undefined).map(packageName))].sort(),
    )
  })
})
