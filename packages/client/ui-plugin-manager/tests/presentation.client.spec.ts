/**
 * Display labels: how a registry, a package, a row, and a notice read in the
 * active locale, including the fallbacks that must never claim another registry.
 */

import { describe, expect, it } from 'vitest'
import type { LocalizedText } from '@qilin-agent/package-manifest'
import { en } from '../src/client/locales.ts'
import {
  managementText, noticeText, packageText, registryText, restartText, rowText, shortName,
} from '../src/client/presentation.ts'

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

/** English-package-text resolver, as the locale seat answers under the en dictionary. */
const resolveEn = (text: LocalizedText): string => typeof text === 'string' ? text : text.en

describe('shortName, packageText, and rowText', () => {
  it('compacts a package name to what a person calls it', () => {
    expect(shortName('@acme/qilin-better-sidebar')).toBe('better-sidebar')
    expect(shortName('qilin-host-thing')).toBe('thing')
    expect(shortName('@qilin-agent/client-ui-plugin-manager')).toBe('client-ui-plugin-manager')
  })

  it('localizes exported package metadata and falls back to the technical name', () => {
    expect(packageText({ name: '@acme/qilin-tool' }, resolveEn))
      .toEqual({ title: '@acme/qilin-tool', description: undefined, beta: false })
    expect(packageText({
      name: '@acme/qilin-tool',
      meta: { title: { en: 'Automation tasks', zh: '自动化任务' }, description: { en: 'Run tasks.', zh: '按设定时间执行。' } },
    }, resolveEn)).toEqual({ title: 'Automation tasks', description: 'Run tasks.', beta: false })
    // An empty description reads as absent rather than as an empty line.
    expect(packageText({ name: '@acme/qilin-tool', meta: { description: '' } }, resolveEn))
      .toEqual({ title: '@acme/qilin-tool', description: undefined, beta: false })
    // An experimental package is the beta surface.
    expect(packageText({ name: '@qilin-agent/experimental-auto-review' }, resolveEn))
      .toEqual({ title: '@qilin-agent/experimental-auto-review', description: undefined, beta: true })
  })

  it('falls back from a row\'s metadata to its module specifier', () => {
    expect(rowText({ moduleName: '@acme/qilin-sidebar/client' }, resolveEn))
      .toEqual({ title: '@acme/qilin-sidebar/client', description: undefined })
    expect(rowText({
      moduleName: 'dsh-better-sidebar', meta: { title: { en: 'Sidebar' }, description: { en: 'The sidebar row.' } },
    }, resolveEn)).toEqual({ title: 'Sidebar', description: 'The sidebar row.' })
  })
})

describe('noticeText, managementText, and restartText', () => {
  it('words each outcome, including the refusal codes a failed action carries', () => {
    expect(noticeText({ kind: 'cancelled', seq: 1 }, t)).toBe(en.installCancelled)
    expect(noticeText({ kind: 'refresh-failed', seq: 2 }, t)).toBe(en.refreshError)
    expect(noticeText({ kind: 'restart', packageName: 'dsh-x', reason: undefined, seq: 3 }, t))
      .toBe(en.restartNotice.replace(' {reason}', ''))
    expect(noticeText({ kind: 'restart', packageName: 'dsh-x', reason: 'package-moved', seq: 4 }, t))
      .toBe(en.restartNotice.replace('{reason}', en.restartReasonPackageMoved))
    expect(noticeText({ kind: 'overridden', packageName: 'dsh-x', seq: 5 }, t)).toBe(t('overriddenNotice', { name: 'dsh-x' }))
    expect(noticeText({ kind: 'install', outcome: 'failed', seq: 6 }, t)).toBe(en.installBackgroundFailed)
    expect(noticeText({ kind: 'failed', action: 'disable', reason: 'ERR', seq: 7 }, t)).toBe(t('failedDisable', { reason: 'ERR' }))
    // A refusal whose code says it all reads as the operation error's own sentence.
    expect(noticeText({ kind: 'failed', action: 'enable', reason: '', seq: 8 }, t)).toBe(t('failedEnable', { reason: en.reasonOperationError }))
    expect(noticeText({ kind: 'failed', action: 'uninstall', code: 'not-removable', reason: '', seq: 9 }, t))
      .toBe(t('failedUninstall', { reason: en.reasonNotRemovable }))
  })

  it('words a management error by its code, its named packages, and the Host diagnostic', () => {
    expect(managementText({ code: 'not-removable' }, t)).toBe(en.reasonNotRemovable)
    expect(managementText({ code: 'operation-error', diagnostic: 'boom' }, t)).toBe('boom')
    expect(managementText({ code: 'operation-error', diagnostic: '' }, t)).toBe(en.reasonOperationError)
    expect(managementText({ code: 'incompatible-version', installing: true, incompatible: [
      { name: 'dsh-late', version: '2.0.0', runtimeVersion: '0.1.0', requirements: { '@qilin-agent/core': '^0.2.0' } },
    ] }, t)).toBe([
      t('reasonIncompatibleVersion', { plugin: 'dsh-late@2.0.0', runtime: '0.1.0', requirements: '@qilin-agent/core ^0.2.0' }),
      t('reasonIncompatibleInstall'),
    ].join(t('sentenceSeparator')))
    // A refusal that names no package keeps the unnamed sentence and the remedy for an installed plugin.
    expect(managementText({ code: 'incompatible-version' }, t))
      .toBe([en.reasonIncompatibleVersionUnnamed, en.reasonIncompatibleInstalled].join(en.sentenceSeparator))
    expect(managementText({ code: 'incompatible-version', installing: true }, t))
      .toBe([en.reasonIncompatibleVersionUnnamed, en.reasonIncompatibleInstall].join(en.sentenceSeparator))
  })

  it('names why a change waits for a restart, and asks for the restart when the Host names none', () => {
    expect(restartText('restartNotice', 'no-hmr', t)).toBe(en.restartNotice.replace('{reason}', en.restartReasonNoHmr))
    expect(restartText('installDoneRestart', undefined, t)).toBe(en.installDoneRestart.replace(' {reason}', ''))
  })
})
