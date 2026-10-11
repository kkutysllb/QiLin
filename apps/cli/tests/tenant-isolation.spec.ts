/** One web address, many accounts: what each account's runtime owns on its own. */

import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_DIRECTORY,
  isTenantIdentity,
  tenantChildEnvironment,
  tenantDirectory,
  tenantPatchYaml,
} from '../src/tenant-runtime.ts'
import { routingCookie, startDeployment, type StartedDeployment } from './fixtures/deployment.ts'

const running: StartedDeployment[] = []

afterEach(async () => {
  for (const deployment of running.splice(0)) await deployment.dispose()
})

/** Hand one browser request to an account, which creates its runtime. */
async function handoff(deployment: StartedDeployment, username: string): Promise<void> {
  const id = deployment.accounts.get(username) ?? ''
  expect((await fetch(deployment.base, { headers: { cookie: routingCookie(id) } })).status).toBe(200)
}

describe('tenant isolation', () => {
  it('gives every account a directory of its own, one name below the deployment home', () => {
    const home = '/deployment'
    expect(tenantDirectory(home, 'alice')).toBe(join(home, 'tenants', 'alice'))
    expect(tenantDirectory(home, 'bob')).toBe(join(home, 'tenants', 'bob'))
    // The first-run runtime owns a directory too, and its name can never be an
    // account's, so the two can never name one directory.
    expect(tenantDirectory(home, BOOTSTRAP_DIRECTORY)).toBe(join(home, 'tenants', BOOTSTRAP_DIRECTORY))
    expect(isTenantIdentity(BOOTSTRAP_DIRECTORY)).toBe(false)
    // A tenant may not be named after a directory the deployment keeps itself:
    // the ledger lives in `tenants/.usage`, so such an identity would hand a
    // runtime the deployment's own bookkeeping as its harness home.
    for (const reserved of ['.usage', '.bootstrap', '.']) expect(isTenantIdentity(reserved)).toBe(false)
  })

  it('admits one account per tenant layer and never a second one', () => {
    const roster = ['alice', 'bob', 'carol']
    for (const account of roster) {
      const document = tenantPatchYaml(account)
      expect(document).toContain(`      - '${account}'`)
      for (const other of roster.filter(entry => entry !== account)) expect(document).not.toContain(other)
      // The roster is the one thing a deployment shares; a tenant's own plugins,
      // model settings, credentials, sessions, and storages are not named here,
      // because they live in the tenant home instead.
      expect(document).toContain('qilinHome: !!js process.env.QILIN_DEPLOYMENT_HOME')
      expect(document).toContain('registration: closed')
    }
  })

  it('hands each runtime a home of its own, with the agent root inside it', () => {
    const home = '/deployment'
    const alice = tenantDirectory(home, 'alice')
    const environment = tenantChildEnvironment(alice, home, {}, 'alice')
    expect(environment.QILIN_HOME).toBe(alice)
    expect(environment.QILIN_AGENTS_HOME).toBe(join(alice, 'agents'))
  })

  it('provisions a directory per account through the hub, beside each other', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 0 })
    running.push(deployment)
    for (const username of ['alice', 'bob']) await handoff(deployment, username)

    const alice = deployment.options.get(deployment.accounts.get('alice') ?? '')
    const bob = deployment.options.get(deployment.accounts.get('bob') ?? '')
    // One home is shared — the roster the deployment manages — and each runtime
    // is handed a harness home of its own under it.
    expect(alice?.home).toBe(deployment.home)
    expect(bob?.home).toBe(deployment.home)
    const aliceDirectory = tenantDirectory(deployment.home, alice?.accountId ?? '')
    const bobDirectory = tenantDirectory(deployment.home, bob?.accountId ?? '')
    expect(aliceDirectory).not.toBe(bobDirectory)
    for (const directory of [aliceDirectory, bobDirectory]) {
      expect(join(directory, '..')).toBe(join(deployment.home, 'tenants'))
    }
  })

  it('serves a deployment with no accounts from a first-run directory of its own', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: [], maxTenants: 0 })
    running.push(deployment)
    expect((await fetch(deployment.base)).status).toBe(200)

    const bootstrap = [...deployment.options.values()].find(entry => entry.bootstrap === true)
    // The runtime is keyed by an internal account name, and lives in the
    // first-run directory rather than in one named after that account.
    expect(bootstrap?.directoryName).toBe(BOOTSTRAP_DIRECTORY)
    expect(tenantDirectory(deployment.home, bootstrap?.directoryName ?? ''))
      .toBe(join(deployment.home, 'tenants', BOOTSTRAP_DIRECTORY))
    expect(bootstrap?.accountId).not.toBe(BOOTSTRAP_DIRECTORY)
  })
})
