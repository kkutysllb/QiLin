/** What a start says about the entry address and the interface the runtimes bind. */

import { describe, expect, it } from 'vitest'
import { addressNotices } from '../src/tenants.ts'

describe('startup address notices', () => {
  it('says nothing when the entry and the runtimes are both on loopback', () => {
    expect(addressNotices('127.0.0.1', undefined, 8790)).toEqual([])
    expect(addressNotices('127.0.0.1', '127.0.0.1', 8790)).toEqual([])
  })

  it('states a reachable entry address and that the runtimes stay loopback', () => {
    expect(addressNotices('0.0.0.0', undefined, 8790)).toEqual([
      'qilin tenants: this address is reachable at 0.0.0.0:8790; every account runtime stays on loopback',
    ])
  })

  it('states the interface a reachable tenant host exposes instead of claiming loopback', () => {
    const [notice] = addressNotices('0.0.0.0', '10.0.0.5', 8790)
    expect(notice).toContain('this address is reachable at 0.0.0.0:8790')
    expect(notice).toContain('each account runtime is reachable at 10.0.0.5 over plain HTTP, with no entry in between')
    expect(notice).not.toContain('stays on loopback')
  })

  it('states the runtimes alone when only they are exposed', () => {
    expect(addressNotices('127.0.0.1', '10.0.0.5', 8790)).toEqual([
      'qilin tenants: each account runtime is reachable at 10.0.0.5 over plain HTTP, with no entry in between',
    ])
  })
})
