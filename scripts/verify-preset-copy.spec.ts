/** The shipped-preset copy gate admits agreement and rejects each drift form. */

import { describe, expect, it } from 'vitest'
import {
  checkPresetContractProse,
  checkPresetCopy,
  copyKeyPresetIds,
  parseDictionaryKeys,
  parseDisplayRows,
} from './verify-preset-copy.ts'

const DISPLAY = [
  'const BUILT_IN_PRESET_KEYS = {',
  "  ptc: { name: 'presetPtcName', description: 'presetPtcDescription' },",
  '}',
].join('\n')

const DICTIONARY = [
  'export const zh = {',
  "  presetPtcName: '编码模式',",
  "  presetPtcDescription: '功能完整的编码 Agent。',",
  "  builtIn: '内置',",
  '}',
].join('\n')

const corpus = (overrides: Partial<Parameters<typeof checkPresetCopy>[0]> = {}) => ({
  shippedIds: ['ptc'],
  displayRows: parseDisplayRows(DISPLAY),
  dictionaryKeys: { 'packages/client/example/src/client/locales.ts': parseDictionaryKeys(DICTIONARY) },
  ...overrides,
})

describe('parsing', () => {
  it('reads the display map rows', () => {
    expect(parseDisplayRows(DISPLAY)).toEqual([
      { id: 'ptc', nameKey: 'presetPtcName', descriptionKey: 'presetPtcDescription' },
    ])
  })

  it('reads flat dictionary keys and ignores nested or non-key lines', () => {
    const source = ['export const en = {', "  a: 'x',", '  nested: {', "    b: 'y',", '  },', '}', ''].join('\n')
    expect(parseDictionaryKeys(source)).toEqual(['a', 'nested'])
  })

  it('maps copy keys back to preset ids', () => {
    expect(copyKeyPresetIds(['presetPtcName', 'presetPtcDescription', 'builtIn'])).toEqual(['ptc', 'ptc'])
  })
})

describe('checkPresetContractProse', () => {
  it('rejects a retired id named as a preset in prose', () => {
    expect(checkPresetContractProse('docs/user/guide/x.md', 'The Session selects the `standard` agent preset.\n'))
      .toEqual(['docs/user/guide/x.md:1 names a retired preset id where presets are documented; the deployment ships `ptc` alone'])
  })

  it('rejects a retired id used as the recorded preset of a lane fixture', () => {
    expect(checkPresetContractProse('apps/cli/tests/fixtures/x/cordis.yml', '        agentPreset: minimal\n')).toHaveLength(1)
    expect(checkPresetContractProse('lane.e2e.ts', "      projections: { values: { agentPreset: 'minimal' } },\n")).toHaveLength(1)
  })

  it('accepts the shipped preset, and a retired id that names something other than a preset', () => {
    expect(checkPresetContractProse('x.md', [
      'The Session selects the `ptc` agent preset.',
      'The `cordis` loader reads `cordis.patch.yml` and never names a preset.',
      'Standard input and standard output are unrelated.',
      '',
    ].join('\n'))).toEqual([])
  })
})

describe('checkPresetCopy', () => {
  it('accepts a roster, map, and dictionary that agree', () => {
    expect(checkPresetCopy(corpus())).toEqual([])
  })

  it('rejects a shipped preset with no copy mapping', () => {
    expect(checkPresetCopy(corpus({ shippedIds: ['ptc', 'extra'] })))
      .toEqual(['shipped preset `extra` has no copy mapping in packages/preset/agent-presets/src/display.ts'])
  })

  it('rejects a mapping for a preset the deployment does not ship', () => {
    expect(checkPresetCopy(corpus({ shippedIds: [] }))).toEqual([
      'packages/preset/agent-presets/src/display.ts maps `ptc`, which is not a shipped preset',
    ])
  })

  it('rejects a retired preset id kept in the display map', () => {
    // A retired id is reported as retired rather than as an unknown shipped one.
    const failures = checkPresetCopy(corpus({
      displayRows: [{ id: 'cordis', nameKey: 'presetCordisName', descriptionKey: 'presetCordisDescription' }],
    }))
    expect(failures).toContain('packages/preset/agent-presets/src/display.ts still maps the retired preset id `cordis`')
  })

  it('rejects a dictionary that lost a copy key', () => {
    const failures = checkPresetCopy(corpus({
      dictionaryKeys: { 'locales.ts': ['presetPtcName', 'builtIn'] },
    }))
    expect(failures).toEqual(['locales.ts is missing copy key `presetPtcDescription`'])
  })

  it('rejects retired copy left behind in a dictionary', () => {
    const failures = checkPresetCopy(corpus({
      dictionaryKeys: { 'locales.ts': ['presetPtcName', 'presetPtcDescription', 'presetStandardName'] },
    }))
    expect(failures).toContain('locales.ts carries preset copy key `presetStandardName`, which no shipped preset maps')
    expect(failures).toContain('locales.ts carries copy for the retired preset id `standard`')
  })
})
