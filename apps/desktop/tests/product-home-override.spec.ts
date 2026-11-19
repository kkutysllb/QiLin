/** An explicit Desktop home must move both roots; the manifest decides when it is absent. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DesktopProduct } from '../src/product.ts'
import { resolveLaunchDirectories } from '../src/product-runtime.ts'

const product: DesktopProduct = {
  schemaVersion: 1,
  name: 'KToon',
  appId: 'com.ktoon.desktop',
  scheme: 'ktoon',
  homeRelative: '.ktoon',
  harnessHomeRelative: '.ktoon',
  devHarnessHomeRelative: '.ktoon',
  profile: 'ktoon',
  profileBundles: ['@qilin-agent/base', '@qilin-agent/web-app', '@ktoon/web'],
  auth: {
    mode: 'welcome',
    secretEnv: 'KTOON_DESKTOP_BOOT_SECRET',
    endpoint: '/api/auth/session',
    header: 'x-ktoon-boot-secret',
  },
  office: false,
  update: null,
}

describe('launch directories', () => {
  it('uses the product roots when nothing overrides the Desktop home', () => {
    expect(resolveLaunchDirectories(product, false, '/Users/example', {})).toEqual({
      dataDir: '/Users/example/.ktoon-dev',
      harnessHome: '/Users/example/.ktoon',
    })
    expect(resolveLaunchDirectories(product, true, '/Users/example', {})).toEqual({
      dataDir: '/Users/example/.ktoon',
      harnessHome: '/Users/example/.ktoon',
    })
  })

  it('names both roots with an explicit Desktop home', () => {
    const environment = { QILIN_DESKTOP_HOME: '/srv/ktoon-home' }
    expect(resolveLaunchDirectories(product, false, '/Users/example', environment)).toEqual({
      dataDir: '/srv/ktoon-home',
      harnessHome: '/srv/ktoon-home',
    })
    expect(resolveLaunchDirectories(product, true, '/Users/example', environment)).toEqual({
      dataDir: '/srv/ktoon-home',
      harnessHome: '/srv/ktoon-home',
    })
  })

  it('expands a tilde in the Desktop home override', () => {
    const { dataDir, harnessHome } = resolveLaunchDirectories(product, true, '/Users/example', { QILIN_DESKTOP_HOME: '~/ktoon-test' })
    expect(dataDir).toBe(join(homedir(), 'ktoon-test'))
    expect(harnessHome).toBe(join(homedir(), 'ktoon-test'))
  })

  it('treats a blank Desktop home override as unset', () => {
    expect(resolveLaunchDirectories(product, true, '/Users/example', { QILIN_DESKTOP_HOME: '   ' })).toEqual({
      dataDir: '/Users/example/.ktoon',
      harnessHome: '/Users/example/.ktoon',
    })
  })
})
