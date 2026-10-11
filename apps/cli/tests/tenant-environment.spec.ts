/** The environment one tenant runtime starts with: which roots it may resolve. */

import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_VARIABLE,
  AGENTS_HOME_VARIABLE,
  DEPLOYMENT_HOME_VARIABLE,
  TENANT_VARIABLE,
  tenantChildEnvironment,
} from '../src/tenant-runtime.ts'

const TENANT_DIR = '/srv/qilin/tenants/alice'
const DEPLOYMENT_HOME = '/srv/qilin'

describe('tenant child environment', () => {
  it('points every tenant-scoped root inside the tenant home', () => {
    const env = tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, {})
    expect(env.QILIN_HOME).toBe(TENANT_DIR)
    expect(env[AGENTS_HOME_VARIABLE]).toBe(`${TENANT_DIR}/agents`)
    expect(env[TENANT_VARIABLE]).toBe('1')
    // The deployment home reaches the roster layer, and nothing else of it.
    expect(env[DEPLOYMENT_HOME_VARIABLE]).toBe(DEPLOYMENT_HOME)
  })

  it('overrides an agent-config root the hub inherited', () => {
    // The hub's own value is a shared root — the operator's ~/.agents, or a
    // directory the deployment names. A tenant resolving user skills or agent
    // documents there would read its neighbour's.
    const env = tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, { [AGENTS_HOME_VARIABLE]: '/Users/operator/.agents' })
    expect(env[AGENTS_HOME_VARIABLE]).toBe(`${TENANT_DIR}/agents`)
  })

  it('drops every credential-shaped name the hub was launched with', () => {
    // A key the hub carries authenticates the hub. Handing it to each account
    // would bill one account's requests to whoever started the deployment, so a
    // tenant reaches a provider through its own credential record instead.
    const env = tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, {
      PATH: '/usr/bin',
      DEEPSEEK_API_KEY: 'key',
      OPENAI_API_KEY: 'key',
      ANTHROPIC_API_KEY: 'key',
      DB_PASSWORD: 'pw',
      CI_SECRET: 's',
      GH_TOKEN: 't',
    })
    expect(env.PATH).toBe('/usr/bin')
    for (const name of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DB_PASSWORD', 'CI_SECRET', 'GH_TOKEN']) {
      expect(env[name]).toBeUndefined()
    }
  })

  it('keeps the deployment policy the hub was launched with', () => {
    // Isolation is about one account not reaching another's data; the
    // deployment's own policy variables are not another account's data.
    const env = tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, { QILIN_TOOLS_MODE: 'all', DEEPSEEK_BASE_URL: 'https://gateway.internal' })
    expect(env.QILIN_TOOLS_MODE).toBe('all')
    expect(env.DEEPSEEK_BASE_URL).toBe('https://gateway.internal')
  })

  it('names the account the runtime serves, and nothing for the first-run runtime', () => {
    expect(tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, {}, 'account-1')[ACCOUNT_VARIABLE]).toBe('account-1')
    // The first-run runtime serves no account yet, so its documents name none.
    expect(tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, {})[ACCOUNT_VARIABLE]).toBeUndefined()
  })

  it('carries no credential-shaped name at all when it inherits the hub', () => {
    const env = tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME)
    // The invariant holds whatever the developer's own environment holds.
    for (const name of Object.keys(env)) expect(/KEY|PASSWORD|SECRET|TOKEN/i.test(name)).toBe(false)
    expect(env.QILIN_HOME).toBe(TENANT_DIR)
  })
})
