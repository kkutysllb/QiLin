/** The Host half of ui-settings-general exists only so the Loader can register the browser package. */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-settings-general host entry', () => {
  it('adds no Host behavior', () => {
    expect(() => { apply() }).not.toThrow()
  })
})
