/** The deployment's own TLS: what the browser reaches, and what every runtime is told. */

import { mkdtemp, rm } from 'node:fs/promises'
import { request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routingCookie, startDeployment, type StartedDeployment } from './fixtures/deployment.ts'
import { materializeDeploymentTls } from './fixtures/tls.ts'

const running: StartedDeployment[] = []
const roots: string[] = []

afterEach(async () => {
  for (const deployment of running.splice(0)) await deployment.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** One read of the hub's own address through a client that trusts its certificate. */
function readTls(url: string, cert: string, headers: Record<string, string> = {}): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { ca: cert, headers }, (response) => {
      response.resume()
      resolve({ status: response.statusCode ?? 0 })
    })
    request.on('error', reject)
    request.end()
  })
}

/** Start one deployment that terminates TLS, with its material under a temporary root. */
async function startTlsDeployment(usernames: readonly string[]): Promise<{ deployment: StartedDeployment; cert: string }> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-deployment-tls-'))
  roots.push(root)
  const tls = await materializeDeploymentTls(root)
  const deployment = await startDeployment({
    usernames,
    maxTenants: 0,
    tls: { certFile: tls.certFile, keyFile: tls.keyFile },
  })
  running.push(deployment)
  return { deployment, cert: tls.cert }
}

describe('deployment TLS', () => {
  it('serves its address over TLS and tells every runtime to mark cookies Secure', { timeout: 60_000 }, async () => {
    const { deployment, cert } = await startTlsDeployment(['alice'])

    expect(deployment.base.startsWith('https://')).toBe(true)
    // A client trusting the generated certificate completes the handshake, and an
    // account handoff works over that connection.
    expect((await readTls(`${deployment.base}healthz`, cert)).status).toBe(200)
    const id = deployment.accounts.get('alice') ?? ''
    expect((await readTls(deployment.base, cert, { cookie: routingCookie(id) })).status).toBe(200)
    // The runtime is told the browser reaches it over TLS, which is what makes its
    // session cookie `Secure`.
    expect(deployment.options.size).toBe(1)
    for (const runtime of deployment.options.values()) expect(runtime.sessionCookieSecure).toBe(true)
  })

  it('tells the first-run runtime the same thing', { timeout: 60_000 }, async () => {
    const { deployment, cert } = await startTlsDeployment([])

    expect((await readTls(deployment.base, cert)).status).toBe(200)
    const bootstrap = [...deployment.options.values()].find(entry => entry.bootstrap === true)
    expect(bootstrap?.sessionCookieSecure).toBe(true)
  })

  it('leaves a plain-HTTP deployment without Secure cookies', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice'], maxTenants: 0 })
    running.push(deployment)
    const id = deployment.accounts.get('alice') ?? ''
    expect((await fetch(deployment.base, { headers: { cookie: routingCookie(id) } })).status).toBe(200)

    expect(deployment.base.startsWith('http://')).toBe(true)
    expect(deployment.options.size).toBe(1)
    // The flag is present and false, so the runtime never has to guess.
    for (const runtime of deployment.options.values()) expect(runtime.sessionCookieSecure).toBe(false)
  })
})
