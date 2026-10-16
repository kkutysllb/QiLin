import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DSH_HOME_DISPLAY, DSH_HOME_DIR_NAME, DSH_HOME_ENV, defaultDshHome,
  dshCachePath, dshHomePath, DEFAULT_QILIN_HOME_DISPLAY, QILIN_HOME_DIR_NAME,
  QILIN_HOME_ENV, defaultQilinHome, qilinCachePath, qilinHomePath, resolveDshHome,
  resolveQilinHome,
} from '../src/index.ts'

describe('upstream-named compat surface', () => {
  it('aliases the upstream names onto the QiLin implementations', () => {
    expect(defaultDshHome).toBe(defaultQilinHome)
    expect(resolveDshHome).toBe(resolveQilinHome)
    expect(dshHomePath).toBe(qilinHomePath)
    expect(DSH_HOME_DIR_NAME).toBe(QILIN_HOME_DIR_NAME)
    expect(DEFAULT_DSH_HOME_DISPLAY).toBe(DEFAULT_QILIN_HOME_DISPLAY)
    expect(DSH_HOME_ENV).toBe(QILIN_HOME_ENV)
  })

  it('dshCachePath accepts the upstream dshHome option key', () => {
    expect(dshCachePath({ dshHome: '/home/x' }, 'cache')).toBe(qilinCachePath({ qilinHome: '/home/x' }, 'cache'))
  })

  it('dshHomePath resolves segments under the resolved home', () => {
    expect(dshHomePath('a', 'b')).toBe(qilinHomePath('a', 'b'))
    expect(dshHomePath()).toBe(qilinHomePath())
  })
})
