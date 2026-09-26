/**
 * Display labels: how a registry, a package name, and a notice read in the
 * active locale, including the fallbacks that must never claim another registry.
 */

import { describe, expect, it } from 'vitest'
import { en } from '../src/client/locales.ts'
import { managementText, noticeText, packageText, registryText, shortName } from '../src/client/presentation.ts'

/** The translate seat over the English dictionary, with the placeholders this spec needs. */
const t = ((key: keyof typeof en, vars?: Record<string, string>) => {
  const template = en[key]
  return vars === undefined ? template : template.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? '')
}) as Parameters<typeof registryText>[1]

describe('registryText', () => {
  it('names npm\'s own registry by name, a known mirror by name, and any other by its host', () => {
    expect(registryText('https://registry.npmjs.org', t, null)).toEqual({ name: en.registryOfficial, host: 'registry.npmjs.org' })
    expect(registryText('https://registry.npmmirror.com/', t, null)).toEqual({ name: en.registryNpmmirror, host: 'registry.npmmirror.com' })
    expect(registryText('https://npm.corp.example/', t, null)).toEqual({ name: 'npm.corp.example', host: 'npm.corp.example' })
  })

  it('reads pnpm\'s own configuration by the registry it names, and neutrally while that is unread', () => {
    expect(registryText(null, t, 'https://registry.npmjs.org/')).toEqual({ name: en.registryOfficial, host: 'registry.npmjs.org' })
    // A configuration the Host could not read names no registry.
    expect(registryText(null, t, null)).toEqual({ name: en.registryDefault, host: 'registry.npmjs.org' })
  })

  it('shows a remembered registry that no longer parses as written', () => {
    expect(registryText('not a url', t, null)).toEqual({ name: 'not a url', host: 'not a url' })
  })
})

describe('packageText and shortName', () => {
  it('keeps the technical name for an unknown package and localizes a built-in one', () => {
    expect(shortName('@acme/qilin-better-sidebar')).toBe('better-sidebar')
    expect(shortName('qilin-host-thing')).toBe('thing')
    expect(packageText({ name: '@acme/qilin-tool', description: 'A tool.' }, t)).toEqual({
      title: 'tool', description: 'A tool.', beta: false,
    })
    expect(packageText({ name: '@qilin/experimental-auto-review' }, t)).toEqual({
      title: en.builtinAutoReviewTitle, description: en.builtinAutoReviewDescription, beta: true,
    })
  })
})

describe('noticeText and managementText', () => {
  it('words each outcome, including the refusal codes a failed action carries', () => {
    expect(noticeText({ kind: 'cancelled', seq: 1 }, t)).toBe(en.installCancelled)
    expect(noticeText({ kind: 'restart', packageName: 'qilin-x', seq: 2 }, t)).toBe(en.restartNotice)
    expect(noticeText({ kind: 'overridden', packageName: 'qilin-x', seq: 3 }, t)).toBe(t('overriddenNotice', { name: 'qilin-x' }))
    expect(noticeText({ kind: 'failed', action: 'update', reason: 'ERR', seq: 4 }, t)).toBe(t('failedUpdate', { reason: 'ERR' }))
    expect(managementText({ code: 'not-removable' }, t)).toBe(en.reasonNotRemovable)
    expect(managementText({ code: 'operation-error', diagnostic: 'boom' }, t)).toBe('boom')
  })
})
