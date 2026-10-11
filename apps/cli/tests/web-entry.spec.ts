/**
 * The deployment entry's own flags: one command carries the deployment's knobs,
 * a value it cannot honour stops the process instead of quietly defaulting, and
 * every argument the deployment does not own reaches the served application.
 */
import { describe, expect, it } from 'vitest'
import { ENTRY_PROFILES, deploymentOptions, isWebEntry, runWebEntry } from '../src/web-entry.ts'
import { TENANT_VARIABLE } from '../src/tenant-runtime.ts'

describe('the Web deployment entry', () => {
  it('is the entry of every profile that serves a browser address', () => {
    expect(ENTRY_PROFILES).toEqual(['qilin', 'web'])
  })

  it('treats a marked process as one account runtime rather than the entry', () => {
    const previous = process.env[TENANT_VARIABLE]
    try {
      Reflect.deleteProperty(process.env, TENANT_VARIABLE)
      expect(isWebEntry()).toBe(true)
      process.env[TENANT_VARIABLE] = '1'
      expect(isWebEntry()).toBe(false)
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, TENANT_VARIABLE)
      else process.env[TENANT_VARIABLE] = previous
    }
  })

  it('refuses a flag value it cannot honour', async () => {
    const invocation = (args: readonly string[]) => runWebEntry({ args, profile: 'qilin', patches: [] })
    await expect(invocation(['--port', 'eight'])).rejects.toThrow(/--port needs a whole number/u)
    await expect(invocation(['--idle-ms', '-1'])).rejects.toThrow(/--idle-ms needs a whole number/u)
    await expect(invocation(['--max-tenants', 'two'])).rejects.toThrow(/--max-tenants needs a whole number/u)
    await expect(invocation(['--restart-backoff-ms', 'soon'])).rejects.toThrow(/--restart-backoff-ms needs a whole number/u)
  })

  it('refuses a flag that names no value, a wildcard address, and one TLS half', async () => {
    const invocation = (args: readonly string[]) => runWebEntry({ args, profile: 'qilin', patches: [] })
    await expect(invocation(['--host'])).rejects.toThrow(/--host needs a value/u)
    await expect(invocation(['--host=0.0.0.0'])).rejects.toThrow(/wildcard/u)
    await expect(invocation(['--tls-cert', 'chain.pem'])).rejects.toThrow(/--tls-cert and --tls-key must be supplied together/u)
    await expect(invocation(['--tls-cert', 'chain.pem', '--tls-key', 'key.pem', '--per-account-ports']))
      .rejects.toThrow(/cannot be combined with --per-account-ports/u)
  })

  it('refuses --from-default-profile, which initializes a profile a deployment does not serve', async () => {
    await expect(runWebEntry({ args: [], profile: 'web', patches: [], fromDefaultProfile: 'web' }))
      .rejects.toThrow(/--from-default-profile/u)
  })

  it('reads the deployment address and the application arguments apart', () => {
    const options = deploymentOptions([
      '--host', '10.0.0.7',
      '--port=8443',
      '--patch', 'one.yml',
      '--patch', 'two.yml',
      '--trusted-host', 'proxy.internal',
      '--no-open',
      '--future-app-flag',
    ], 'web')
    expect(options.host).toBe('10.0.0.7')
    expect(options.port).toBe(8443)
    expect(options.tenantProfile).toBe('web')
    expect(options.singleOrigin).toBe(true)
    expect(options.help).toBe(false)
    // The deployment consumes its own flags; everything else is the
    // application's, including a flag this build does not know.
    expect(options.appArguments).toEqual(['--trusted-host', 'proxy.internal', '--future-app-flag'])
  })

  it('defaults to the loopback address and answers registration from the address it binds', () => {
    const loopback = deploymentOptions([], 'qilin')
    expect(loopback.host).toBe('127.0.0.1')
    expect(loopback.port).toBe(8790)
    expect(loopback.registration).toBe('open')
    expect(loopback.tls).toBeUndefined()
    expect(loopback.appArguments).toEqual([])
    // An address other machines reach does not let its form create accounts
    // unless the operator says so.
    expect(deploymentOptions(['--host', '10.0.0.7'], 'qilin').registration).toBe('closed')
    expect(deploymentOptions(['--host', '10.0.0.7', '--registration', 'open'], 'qilin').registration).toBe('open')
    expect(() => deploymentOptions(['--registration', 'sometimes'], 'qilin')).toThrow(/--registration is open or closed/u)
  })

  it('resolves a TLS pair against the directory the operator ran in', () => {
    const options = deploymentOptions(['--tls-cert', 'chain.pem', '--tls-key', 'key.pem'], 'web')
    expect(options.tls?.certFile).toBe(`${process.cwd()}/chain.pem`)
    expect(options.tls?.keyFile).toBe(`${process.cwd()}/key.pem`)
    expect(deploymentOptions(['--per-account-ports'], 'web').singleOrigin).toBe(false)
  })

  it('answers help without reading the other values the invocation names', () => {
    const options = deploymentOptions(['--help', '--port', 'not-a-number'], 'web')
    expect(options.help).toBe(true)
    expect(deploymentOptions(['-h'], 'web').help).toBe(true)
  })
})
