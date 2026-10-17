/**
 * Credential scanning and its mask forms: only published formats are
 * recognized, and every masked range stays unreadable while keeping the line
 * breaks of the original text.
 */
import { describe, expect, it } from 'vitest'
import { CredentialScanner, scanSecrets, type SecretRange } from '../src/credential-scanner.ts'
import { CredentialMasks, MASK } from '../src/credential-masks.ts'
import { ADDRESS, KEY_BLOCK, PREFIXED } from '../src/credential-formats.ts'
import { formatTables } from '../src/format-tables.ts'

const masks = new CredentialMasks()

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

describe('CredentialScanner queries', () => {
  const scanner = (): CredentialScanner => new CredentialScanner(formatTables())

  it('answers a query that starts inside an address authority', () => {
    const text = 'https://user:pw@h'
    const password = { start: 13, end: 15, masked: '**' }
    // Inside the `://`, one character before it, at the user name, and at the
    // password's own first character.
    for (const from of [6, 7, 8, 10, 13]) {
      expect(scanner().match(text, from), String(from)).toEqual(password)
    }
    // Past the password there is no address password left to report.
    expect(scanner().match(text, 16)).toBeUndefined()
  })

  it('rejects an authority whose scheme is not a bare lowercase word', () => {
    expect(scanSecrets('1x://user:pw@h')).toEqual([])
    // A space or a non-ASCII code unit before the scheme ends the walk.
    expect(scanSecrets(' x://user:pw@h')).toEqual([])
    expect(scanSecrets('üx://user:pw@h')).toEqual([])
  })

  it('rejects an address without a password', () => {
    expect(scanSecrets('https://user:@h')).toEqual([])
  })

  it('rejects a query whose walk back cannot reach a scheme', () => {
    const instance = scanner()
    expect(instance.match('u:pw@h', 3)).toBeUndefined()
    expect(instance.match('x:pw@h', 2)).toBeUndefined()
    expect(instance.match(`${'u'.repeat(300)}:pw@h`, 301)).toBeUndefined()
  })

  it('reuses memoized runs and block ends across queries of one text', () => {
    const instance = scanner()
    const address = 'https://user:pass@host'
    expect(instance.match(address, 0)?.masked).toBe('****')
    expect(instance.match(address, 0)?.masked).toBe('****')
    const sk = 'sk-' + 'a'.repeat(19) + '1'
    expect(instance.match(sk, 0)?.end).toBe(sk.length)
    expect(instance.match(sk, 0)?.end).toBe(sk.length)
    const block = '-----BEGIN RSA PRIVATE KEY-----\nAA\n-----END RSA PRIVATE KEY-----'
    expect(instance.match(block, 0)?.end).toBe(block.length)
    expect(instance.match(block, 0)?.end).toBe(block.length)
  })

  it('stops a scan at an address password that follows the range it already has', () => {
    // The deferred password starts after the prefixed key the scan already took,
    // so the key stays the range and the scan ends there.
    const key = 'ghp_' + 'A'.repeat(36)
    const text = `https://${key}:pw@h ${key}`
    const [range] = scanSecrets(text)
    expect(text.slice(range?.start, range?.end)).toBe(key)
  })

  it('extends a prefixed range with a later prefixed candidate', () => {
    // `AIza` matches exactly its 35 characters; the key after the hyphen runs on.
    const text = 'AIza' + 'A'.repeat(10) + '-ghp_' + 'B'.repeat(40)
    const [range] = scanSecrets(text)
    expect(range?.start).toBe(0)
    expect(range?.end).toBe(text.length)
    expect(range?.masked.startsWith('AIzaAAAA')).toBe(true)
  })

  it('stops at a candidate inside a range that already reaches the text end', () => {
    const text = 'AIza' + 'A'.repeat(10) + '-ghp_' + 'B'.repeat(10) + '-npm_' + 'C'.repeat(40)
    const [range] = scanSecrets(text)
    expect(range?.start).toBe(0)
    expect(range?.end).toBe(text.length)
  })
})

describe('CredentialMasks', () => {
  it('draws one mark per code point without the readable-prefix rule', () => {
    expect(masks.masked('a😀b', ADDRESS, false, 0, 4)).toBe('***')
    expect(masks.masked('ab', ADDRESS, false, 1, 1)).toBe('')
  })

  it('counts an unpaired surrogate as one character', () => {
    expect(masks.masked('a\uD800', ADDRESS, false, 0, 2)).toBe('**')
    expect(masks.masked('a\uD800b', ADDRESS, false, 0, 3)).toBe('***')
  })

  it('keeps line breaks in place', () => {
    expect(masks.masked('a\r\nb', ADDRESS, false, 0, 4)).toBe('*\r\n*')
  })

  it('leaves the provider prefix of a prefixed key readable, with and without line breaks', () => {
    expect(masks.masked('sk-abcdefgh', PREFIXED, true, 0, 11)).toBe('sk-abcde' + MASK.repeat(3))
    // A range with a line break falls back to the general mask past the eight
    // readable characters, so the break stays in place.
    expect(masks.masked('sk-abc\ndefgh', PREFIXED, false, 0, 12)).toBe('sk-abc\nd' + MASK.repeat(4))
  })

  it('keeps the footer line of a block written across lines', () => {
    const header = '-----BEGIN RSA PRIVATE KEY-----'
    const footer = '-----END RSA PRIVATE KEY-----'
    const text = header + '\r\nBODY\r\n' + footer
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length))
      .toBe(header + '\r\n' + MASK.repeat(4) + '\r\n' + footer)
  })

  it('masks a range shorter than a footer line whole', () => {
    expect(masks.masked('abc', KEY_BLOCK, false, 0, 3)).toBe('***')
  })

  it('masks each of many one-line private key blocks whole, with text after the last', () => {
    const block = '-----BEGIN PRIVATE KEY-----abcd-----END PRIVATE KEY-----'
    const ranges = scanSecrets(`${block} ${block} 完`)
    expect(ranges.map(range => range.masked)).toEqual([MASK.repeat(block.length), MASK.repeat(block.length)])
    expect(ranges[1]?.end).toBe(block.length * 2 + 1)
  })

  it('masks a body longer than the shared mark string with one repeated run', () => {
    const body = 'a'.repeat(5000)
    const text = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length)).toBe(`-----BEGIN PRIVATE KEY-----\n${MASK.repeat(5000)}\n-----END PRIVATE KEY-----`)
    const single = `-----BEGIN PRIVATE KEY-----${body}-----END PRIVATE KEY-----`
    expect(masks.masked(single, KEY_BLOCK, false, 0, single.length)).toBe(MASK.repeat(single.length))
  })

  it('repeats the marks for a shared-string-length line that ends at a line break', () => {
    // A line over the shared string's length cannot slice it, so it repeats.
    const body = 'b'.repeat(5000)
    const text = `-----BEGIN PRIVATE KEY-----\n${body}\n${body}\n-----END PRIVATE KEY-----`
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length))
      .toBe(`-----BEGIN PRIVATE KEY-----\n${MASK.repeat(5000)}\n${MASK.repeat(5000)}\n-----END PRIVATE KEY-----`)
  })

  it('masks a key body that ends inside a surrogate pair without splitting it', () => {
    const text = '-----BEGIN PRIVATE KEY-----\nA😀B'
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length)).toBe('-----BEGIN PRIVATE KEY-----\n***')
  })

  it('masks a body line longer than the shared string that ends with a carriage return', () => {
    const body = 'c'.repeat(5000)
    const text = `-----BEGIN PRIVATE KEY-----\n${body}\r\n-----END PRIVATE KEY-----`
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length))
      .toBe(`-----BEGIN PRIVATE KEY-----\n${MASK.repeat(5000)}\r\n-----END PRIVATE KEY-----`)
  })

  it('counts a high surrogate followed by an ordinary character as two characters', () => {
    const text = '-----BEGIN PRIVATE KEY-----\nA\uD800B\nC\n-----END PRIVATE KEY-----'
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length))
      .toBe('-----BEGIN PRIVATE KEY-----\n***\n*\n-----END PRIVATE KEY-----')
  })

  it('counts a lone high surrogate that ends the body as one character', () => {
    // The body ends right after the surrogate, so there is no next code unit to
    // pair it with.
    const text = '-----BEGIN PRIVATE KEY-----\nA\uD800\n-----END PRIVATE KEY-----'
    expect(masks.masked(text, KEY_BLOCK, false, 0, text.length))
      .toBe('-----BEGIN PRIVATE KEY-----\n**\n-----END PRIVATE KEY-----')
  })

  it('masks a prefixed run without line breaks through the plain path only', () => {
    expect(masks.masked('ghp_' + 'A'.repeat(36), PREFIXED, true, 0, 40)).toBe('ghp_AAAA' + MASK.repeat(32))
  })

  it('skips a wide space inside an address user name and a lone surrogate code unit', () => {
    const scanner = new CredentialScanner(formatTables())
    const wide: readonly string[] = ['\u00a0', '\u1680', '\u2000', '\u2007', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']
    for (const space of wide) expect(scanner.match(`ab${space}pw@h`, 3), JSON.stringify(space)).toBeUndefined()
    expect(scanner.match('x', 5)).toBeUndefined()
  })
})
