/** The environment one tenant runtime starts with: which roots it may resolve. */

import { describe, expect, it } from 'vitest'
import {
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

  it('keeps the rest of the hub environment', () => {
    const env = tenantChildEnvironment(TENANT_DIR, DEPLOYMENT_HOME, { PATH: '/usr/bin', DEEPSEEK_API_KEY: 'key' })
    expect(env.PATH).toBe('/usr/bin')
    expect(env.DEEPSEEK_API_KEY).toBe('key')
  })
})
