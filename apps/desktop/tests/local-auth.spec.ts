import { afterEach, expect, it, vi } from 'vitest'
import { submitLocalAccount } from '../src/local-auth.ts'

afterEach(() => { vi.unstubAllGlobals() })

it('submits the login identifier and returns the minted account session', async () => {
  const send = vi.fn().mockResolvedValue(new Response('{"user":{}}', { headers: {
    'set-cookie': 'qilin-session-abc=v1.payload.sig; Max-Age=1209600; Path=/; HttpOnly; SameSite=Strict',
  } }))
  const result = await submitLocalAccount('http://127.0.0.1:60427', 'login',
    { username: 'kkutys', password: 'secret' }, send)
  const [url, init] = send.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('http://127.0.0.1:60427/api/auth/login')
  expect(JSON.parse(String(init.body))).toEqual({ identifier: 'kkutys', password: 'secret' })
  expect(result).toMatchObject({ ok: true, session: { name: 'qilin-session-abc', value: 'v1.payload.sig' } })
})

it('submits registration fields to the setup route and keeps the acceptance session', async () => {
  const send = vi.fn().mockResolvedValueOnce(new Response('{"user":{}}', { headers: {
    'set-cookie': 'qilin-session-abc=v1.x.y; Max-Age=60; Path=/',
  } }))
  const result = await submitLocalAccount('http://127.0.0.1:60427', 'setup',
    { username: 'kkutys', email: 'a@b.c', password: 'secret' }, send)
  expect(new URL(send.mock.calls[0]![0] as string).pathname).toBe('/api/auth/setup')
  expect(JSON.parse(String(send.mock.calls[0]![1]!.body))).toEqual({ username: 'kkutys', email: 'a@b.c', password: 'secret' })
  expect(result).toMatchObject({ ok: true, session: { name: 'qilin-session-abc', value: 'v1.x.y' } })
})

it('reports a refusal code verbatim and a non-JSON refusal as a bare failure', async () => {
  const send = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'invalid-credentials', message: 'x' } }), { status: 401 }))
    .mockResolvedValueOnce(new Response('gateway says no', { status: 502 }))
  const refused = await submitLocalAccount('http://127.0.0.1:60427', 'login', { username: 'kkutys', password: 'bad' }, send)
  expect(refused).toEqual({ ok: false, reason: 'invalid-credentials' })
  const opaque = await submitLocalAccount('http://127.0.0.1:60427', 'login', { username: 'kkutys', password: 'bad' }, send)
  expect(opaque).toEqual({ ok: false })
})
