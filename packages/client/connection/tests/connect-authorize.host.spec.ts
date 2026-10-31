/** Host Connection /connect admission hands the browser exchange one owner peer. */
import { Context } from '@qilin-agent/kylin'
import type { PeerId } from '@qilin-agent/typert-protocol'
import { describe, expect, it } from 'vitest'
import { HostConnectionService } from '../src/rpc-host.ts'
import type { ConnectionIndexRequest, ConnectionIndexResponse } from '../src/rpc.ts'

/** Browser interactions the admission publishes as one Peer. */
type Interactions = { readonly interactions: string }

function response(): { state: { status: number; body: string }; writeHead: ConnectionIndexResponse['writeHead']; end: ConnectionIndexResponse['end'] } {
  const state = { status: 0, body: '' }
  return {
    state,
    writeHead(status: number) { state.status = status },
    end(body?: string) { state.body = body ?? '' },
  }
}

describe('Host Connection /connect admission', () => {
  it('admits a trusted launch request without a web server and publishes one owner peer', () => {
    const ctx = new Context()
    let secure: boolean | undefined
    let published: PeerId | undefined
    const browserAuth = {
      authorizeConnect(
        _request: ConnectionIndexRequest,
        res: ConnectionIndexResponse,
        isSecure: boolean,
        publish: (interactions: Interactions) => PeerId,
      ) {
        secure = isSecure
        published = publish({ interactions: 'answer' })
        res.writeHead(307)
        res.end('redirect')
      },
    }
    new HostConnectionService(ctx, [], browserAuth as never)
    const service = ctx.get('connection') as HostConnectionService
    const res = response()
    service.authorizeConnect(
      { method: 'GET', url: 'http://127.0.0.1:3080/connect?token=test', headers: { host: '127.0.0.1:3080' } },
      res,
    )
    // No webserver service is mounted, so the exchange never claims TLS.
    expect(secure).toBe(false)
    expect(typeof published).toBe('string')
    expect(res.state.status).toBe(307)
  })

  it('tells the exchange when a mounted web server carries TLS', async () => {
    const ctx = new Context()
    ctx.provide('webServer', { host: '127.0.0.1:3080', protocol: 'https:' } as never)
    let secure: boolean | undefined
    const browserAuth = {
      authorizeConnect(
        _request: ConnectionIndexRequest,
        res: ConnectionIndexResponse,
        isSecure: boolean,
        publish: (interactions: Interactions) => PeerId,
      ) {
        secure = isSecure
        publish({ interactions: 'none' })
        res.writeHead(307)
        res.end('redirect')
      },
    }
    new HostConnectionService(ctx, [], browserAuth as never)
    const service = ctx.get('connection') as HostConnectionService
    const res = response()
    service.authorizeConnect(
      { method: 'GET', url: 'https://127.0.0.1:3080/connect?token=test', headers: { host: '127.0.0.1:3080' } },
      res,
    )
    expect(secure).toBe(true)
    await ctx.fiber.dispose()
  })

  it('refuses a connect that arrives after the service was disposed', async () => {
    const ctx = new Context()
    new HostConnectionService(ctx, [], { authorizeConnect: () => {} } as never)
    const service = ctx.get('connection') as HostConnectionService
    await ctx.fiber.dispose()
    const res = response()
    service.authorizeConnect(
      { method: 'GET', url: 'http://127.0.0.1:3080/connect?token=test', headers: { host: '127.0.0.1:3080' } },
      res,
    )
    expect(res.state.status).toBe(401)
    expect(res.state.body).toBe('unauthorized')
  })

  it('refuses an untrusted authority before the browser auth exchange', () => {
    const ctx = new Context()
    let exchanges = 0
    new HostConnectionService(ctx, [], { authorizeConnect: () => { exchanges += 1 } } as never)
    const service = ctx.get('connection') as HostConnectionService
    const res = response()
    service.authorizeConnect(
      { method: 'GET', url: 'http://rebound.example/connect', headers: { host: 'rebound.example' } },
      res,
    )
    expect(exchanges).toBe(0)
    expect(res.state.status).toBe(403)
  })
})
