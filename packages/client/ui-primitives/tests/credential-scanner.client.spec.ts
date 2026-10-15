/**
 * Credential scanning and its mask forms: only published formats are
 * recognized, and every masked range stays unreadable while keeping the line
 * breaks of the original text.
 */
import { describe, expect, it } from 'vitest'
import { scanSecrets, type SecretRange } from '../src/credential-scanner.ts'
import { MASK, maskKeyBlock, maskPrefixed, maskRange } from '../src/credential-masks.ts'

/** The only range a text yields. */
function only(text: string): SecretRange {
  const ranges = scanSecrets(text)
  expect(ranges).toHaveLength(1)
  return ranges[0] as SecretRange
}

describe('scanSecrets', () => {
  it('masks a prefixed key past its provider prefix', () => {
    const key = 'ghp_' + 'A1'.repeat(18)
    const range = only(key)
    expect(range.start).toBe(0)
    expect(range.end).toBe(40)
    expect(range.masked).toBe('ghp_A1A1' + MASK.repeat(32))
  })

  it('recognizes each published prefix family', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['gho_' + 'A'.repeat(36), 'gho_AAAA'],
      ['ghu_' + 'A'.repeat(36), 'ghu_AAAA'],
      ['ghs_' + 'A'.repeat(36), 'ghs_AAAA'],
      ['ghr_' + 'A'.repeat(36), 'ghr_AAAA'],
      ['github_pat_' + 'A'.repeat(22), 'github_p'],
      ['glpat-' + 'a'.repeat(20), 'glpat-aa'],
      ['npm_' + 'A'.repeat(36), 'npm_AAAA'],
      ['hf_' + 'A'.repeat(30), 'hf_AAAAA'],
      ['AKIA' + 'B'.repeat(16), 'AKIABBBB'],
      ['ASIA' + 'B'.repeat(16), 'ASIABBBB'],
      ['LTAI' + 'B'.repeat(12), 'LTAIBBBB'],
      ['AKID' + 'B'.repeat(28), 'AKIDBBBB'],
      ['xoxa-' + 'b'.repeat(10), 'xoxa-bbb'],
      ['xoxb-' + 'b'.repeat(10), 'xoxb-bbb'],
      ['xoxp-' + 'b'.repeat(10), 'xoxp-bbb'],
      ['xoxr-' + 'b'.repeat(10), 'xoxr-bbb'],
      ['xoxs-' + 'b'.repeat(10), 'xoxs-bbb'],
      ['sk_live_' + 'A'.repeat(16), 'sk_live_'],
      ['sk_test_' + 'A'.repeat(16), 'sk_test_'],
      ['rk_live_' + 'A'.repeat(16), 'rk_live_'],
      ['rk_test_' + 'A'.repeat(16), 'rk_test_'],
      ['whsec_' + 'A'.repeat(24), 'whsec_AA'],
      ['AIza' + 'A'.repeat(35), 'AIzaAAAA'],
    ]
    for (const [text, visible] of cases) {
      const range = only(text)
      expect(range.start, text).toBe(0)
      expect(range.end, text).toBe(text.length)
      expect(range.masked.slice(0, 8), text).toBe(visible)
      expect(range.masked.slice(8), text).toBe(MASK.repeat(text.length - 8))
    }
  })

  it('rejects a value that only resembles a published prefix', () => {
    const rejects: readonly string[] = [
      'sk-' + 'a'.repeat(20),
      'sk-' + 'a'.repeat(256) + '1',
      'sk-a1',
      'x' + 'sk-' + 'a'.repeat(19) + '1',
      'ghp_' + 'A'.repeat(35),
      'AKIA' + 'B'.repeat(17),
      'AKIA' + 'B'.repeat(16) + 'c',
      'AIza' + 'A'.repeat(34),
      '-----BEGIN NOTAKEY-----\nbody',
      '-----BEGIN ' + 'A'.repeat(41) + 'PRIVATE KEY-----',
      '-----BEGIN ABCDEFGHIJKLMNOPRIVATE XEY-----',
    ]
    for (const text of rejects) expect(scanSecrets(text), text).toEqual([])
  })

  it('masks a JSON Web Token and rejects a broken one', () => {
    const token = 'eyJ' + 'A'.repeat(8) + '.eyJ' + 'B'.repeat(8) + '.' + 'C'.repeat(8)
    expect(only(token).masked).toBe('eyJAAAAA' + MASK.repeat(token.length - 8))
    const broken: readonly string[] = [
      'eyJ' + 'A'.repeat(8) + 'B' + 'C',
      'eyJ' + 'A'.repeat(8) + '.eyJ' + 'B'.repeat(7),
      'eyJ' + 'A'.repeat(8) + '.eyJ' + 'B'.repeat(8) + '!',
      'eyJ' + 'A'.repeat(8) + '.eyJ' + 'B'.repeat(8) + '.' + 'C',
      'eyJ' + 'A'.repeat(2049),
    ]
    for (const text of broken) expect(scanSecrets(text), text).toEqual([])
  })

  it('masks only the password of an address that carries credentials', () => {
    const text = 'clone https://user:s3cret@example.com/repo'
    const range = only(text)
    expect(text.slice(range.start, range.end)).toBe('s3cret')
    expect(range.masked).toBe(MASK.repeat(6))
    expect(text.slice(range.end)).toBe('@example.com/repo')
  })

  it('counts a credential character once when it is a surrogate pair', () => {
    expect(only('https://user:p😀s@host').masked).toBe(MASK.repeat(3))
  })

  it('leaves an address without a scheme or without a password plain', () => {
    for (const text of ['123://user:pass@host', 'https://user@host', 'not an address']) {
      expect(scanSecrets(text), text).toEqual([])
    }
  })

  it('keeps a private key block footer and masks its body', () => {
    const header = '-----BEGIN RSA PRIVATE KEY-----'
    const footer = '-----END RSA PRIVATE KEY-----'
    const text = header + '\nMIIEowIBAAKCAQEA\n' + footer
    expect(only(text).masked).toBe(header + '\n' + MASK.repeat(16) + '\n' + footer)
  })

  it('skips an invalid footer line inside a private key block', () => {
    const header = '-----BEGIN RSA PRIVATE KEY-----'
    const text = header + '\n-----END NOTAKEY-----\n-----END RSA PRIVATE KEY-----'
    const range = only(text)
    expect(range.start).toBe(0)
    expect(range.end).toBe(text.length)
    expect(range.masked).toContain('-----END RSA PRIVATE KEY-----')
    expect(range.masked).not.toContain('NOTAKEY')
  })

  it('masks an unterminated private key block to the end of the text', () => {
    const header = '-----BEGIN RSA PRIVATE KEY-----'
    expect(only(header + '\nloose').masked).toBe(header + '\n' + MASK.repeat(5))
  })

  it('masks a single-line private key block whole', () => {
    const text = '-----BEGIN PRIVATE KEY-----AAAA-----END PRIVATE KEY-----'
    expect(only(text).masked).toBe(MASK.repeat(text.length))
  })

  it('merges overlapping candidates into the range that starts first', () => {
    const password = 'sk-' + 'a'.repeat(19) + '1'
    const text = 'https://user:' + password + '@host'
    const range = only(text)
    expect(text.slice(range.start, range.end)).toBe(password)
    expect(range.masked).toBe(MASK.repeat(password.length))
  })

  it('extends a merged range when a later candidate reaches further', () => {
    const text = 'glpat-' + '-'.repeat(20) + '-----BEGIN RSA PRIVATE KEY-----\nAA\n-----END RSA PRIVATE KEY-----'
    const ranges = scanSecrets(text)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]?.end).toBe(text.length)
  })

  it('masks every credential in one text', () => {
    const first = 'sk-' + 'a'.repeat(19) + '1'
    const second = 'ghp_' + 'B'.repeat(36)
    const ranges = scanSecrets('first ' + first + ' then ' + second)
    expect(ranges).toHaveLength(2)
    expect(ranges[0]?.start).toBe(6)
    expect(ranges[1]?.start).toBe(6 + first.length + 6)
  })

  it('finds nothing in text without a credential', () => {
    expect(scanSecrets('')).toEqual([])
    expect(scanSecrets('just a normal sentence')).toEqual([])
  })
})

describe('maskRange', () => {
  it('draws one mark per code point', () => {
    expect(maskRange('a😀b', 0, 4)).toBe('***')
    expect(maskRange('ab', 1, 1)).toBe('')
  })

  it('counts an unpaired surrogate as one character', () => {
    expect(maskRange('a\uD800', 0, 2)).toBe('**')
    expect(maskRange('a\uD800b', 0, 3)).toBe('***')
  })

  it('keeps line breaks in place', () => {
    expect(maskRange('a\r\nb', 0, 4)).toBe('*\r\n*')
  })
})

describe('maskPrefixed', () => {
  it('leaves the provider prefix readable', () => {
    expect(maskPrefixed('sk-abcdefgh', 0, 11)).toBe('sk-abcde' + MASK.repeat(3))
  })
})

describe('maskKeyBlock', () => {
  it('keeps the line breaks of a block written across lines', () => {
    const header = '-----BEGIN RSA PRIVATE KEY-----'
    const footer = '-----END RSA PRIVATE KEY-----'
    const text = header + '\r\nBODY\r\n' + footer
    expect(maskKeyBlock(text, 0, text.length)).toBe(header + '\r\n' + MASK.repeat(4) + '\r\n' + footer)
  })

  it('masks a range shorter than a footer line whole', () => {
    expect(maskKeyBlock('abc', 0, 3)).toBe('***')
  })
})
