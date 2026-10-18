/** Web-localized copy for the shipped preset and file copy for every other row. */

import { describe, expect, it } from 'vitest'
import { en, presetDisplayText, zh } from '../src/client/locales.ts'

const translate = (bundle: typeof en) => (key: keyof typeof en): string => bundle[key]

describe('preset display copy', () => {
  it('localizes each shipped preset in English and Chinese', () => {
    const cases = [
      {
        id: 'standard',
        en: { name: en.presetStandardName, description: en.presetStandardDescription },
        zh: { name: zh.presetStandardName, description: zh.presetStandardDescription },
      },
      {
        id: 'ptc',
        en: { name: en.presetPtcName, description: en.presetPtcDescription },
        zh: { name: zh.presetPtcName, description: zh.presetPtcDescription },
      },
    ]
    for (const { id, en: enCopy, zh: zhCopy } of cases) {
      const preset = { id, trust: 'system' as const, name: 'file name', description: 'file description' }
      expect(presetDisplayText(preset, translate(en))).toEqual(enCopy)
      expect(presetDisplayText(preset, translate(zh))).toEqual(zhCopy)
    }
  })

  it('keeps file metadata for user and unknown system presets', () => {
    const fileCopy = { name: '我的标准', description: '团队自己的 preset。' }

    // User trust wins over the built-in mapping for the same id.
    expect(presetDisplayText({ id: 'ptc', trust: 'user', ...fileCopy }, translate(en)))
      .toEqual(fileCopy)
    expect(presetDisplayText({ id: 'deployment-extra', trust: 'system', ...fileCopy }, translate(en)))
      .toEqual(fileCopy)
    expect(presetDisplayText({ id: 'bare', trust: 'user' }, translate(en)))
      .toEqual({ name: 'bare' })
  })
})
