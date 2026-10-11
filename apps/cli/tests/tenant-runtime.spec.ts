/** One tenant runtime's launch: the deployment's own flags, and the ones only the served application reads. */
import { describe, expect, it } from 'vitest'
import { bootstrapPatchYaml, LOOPBACK_HOSTS, tenantChildArguments, tenantPatchYaml } from '../src/tenant-runtime.ts'

describe('one tenant runtime child', () => {
  it('launches with the deployment overlays before the application arguments', () => {
    expect(tenantChildArguments({
      profile: 'web',
      host: '127.0.0.1',
      patches: ['/abs/one.yml', '/abs/two.yml'],
      appArguments: ['--trusted-host', 'proxy.internal'],
    })).toEqual([
      '--profile', 'web',
      // An overlay is the launcher's own flag, so it travels before the token
      // that hands the rest of the command line to the application.
      '--patch', '/abs/one.yml',
      '--patch', '/abs/two.yml',
      '--host', '127.0.0.1',
      '--port', '0',
      '--no-open',
      '--trusted-host', 'proxy.internal',
    ])
  })

  it('writes the harness-home layer that admits exactly one account', () => {
    const document = tenantPatchYaml('alice')
    expect(document).toContain('qilinHome: !!js process.env.QILIN_DEPLOYMENT_HOME')
    expect(document).toContain('admittedAccounts:')
    expect(document).toContain("      - 'alice'")
    expect(document).toContain('registration: closed')
  })

  it('refuses an identity a path would read as a directory rather than a name', () => {
    for (const identity of ['..', '.', 'a/b', 'a b', '']) {
      expect(() => tenantPatchYaml(identity)).toThrow(/not usable as a tenant directory name/u)
    }
  })

  it('writes the first-run layer with the deployment registration policy', () => {
    expect(bootstrapPatchYaml()).toContain('registration: open')
    expect(bootstrapPatchYaml('closed')).toContain('registration: closed')
    // That layer admits whoever the roster holds, so it names no account.
    expect(bootstrapPatchYaml('open')).not.toContain('admittedAccounts')
  })

  it('treats only this machine\'s own addresses as loopback', () => {
    expect(LOOPBACK_HOSTS).toContain('127.0.0.1')
    expect(LOOPBACK_HOSTS).not.toContain('0.0.0.0')
  })
})
