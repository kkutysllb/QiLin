/**
 * 同源 API proxy — 解决 web-demo (3001) ↔ gateway (8081) 跨端口时的
 * CSRF/cookie 隔离问题。
 *
 * 浏览器 fetch 同源发到 /api/proxy/... → Next.js Route Handler 拿到请求 cookie
 * (HttpOnly 也行,因为是 next/headers cookies()) → 加上 csrf header 转发到 gateway。
 *
 * 前端 client.ts 改成 GATEWAY_BASE_URL = '' (同源),gatewayFetch 自动用相对路径。
 * 这样 credentials: 'include' 自动带 HttpOnly 的 access_token,SERVER-side 转发时
 * 手动加 X-CSRF-Token + Cookie header 给 gateway。
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
]);

function buildGatewayHeaders(req: Request, csrf: string, cookieStr: string): Headers {
  const out = new Headers();
  const incoming = req.headers;
  for (const [k, v] of incoming.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out.set(k, v);
  }
  // 关键:把客户端的 cookie(可能没有 csrf_token,因为浏览器 fetch 已经从 8081 拿到了)
  // 替换成 SSR cookies() 里的完整 cookie(包括 HttpOnly 的 access_token)
  out.set('Cookie', cookieStr);
  out.set('X-CSRF-Token', csrf);
  // 不让 gateway 看到 web-demo 的内部 host
  out.set('Host', new URL(GATEWAY_BASE_URL).host);
  return out;
}

function buildGatewayResponse(resp: Response): NextResponse {
  const out = new NextResponse(resp.body, { status: resp.status });
  resp.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    // gateway set-cookie 已经通过浏览器在 8081 域名下保存,这里转发不会再设到 3001 域名
    if (key.toLowerCase() === 'set-cookie') return;
    out.headers.set(key, value);
  });
  return out;
}

async function handle(req: Request, ctx: { params: { path: string[] } }) {
  const segments = ctx.params.path ?? [];
  const path = '/' + segments.join('/');
  const search = new URL(req.url).search;
  const url = `${GATEWAY_BASE_URL}${path}${search}`;

  const cookieStore = await cookies();
  const csrf = cookieStore.get('csrf_token')?.value;
  const access = cookieStore.get('access_token')?.value;
  if (!csrf || !access) {
    return NextResponse.json(
      { detail: 'Not authenticated', code: 'NO_AUTH' },
      { status: 401 }
    );
  }

  // 构造完整的 cookie 串给 gateway
  const cookieStr = `csrf_token=${csrf}; access_token=${access}; ${
    cookieStore.get('qilin_session_persistent')?.value
      ? 'qilin_session_persistent=' + cookieStore.get('qilin_session_persistent')!.value
      : ''
  }`.trim();

  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();

  const gatewayResp = await fetch(url, {
    method: req.method,
    headers: buildGatewayHeaders(req, csrf, cookieStr),
    body: body && body.byteLength > 0 ? body : undefined,
    cache: 'no-store',
    // @ts-expect-error: Node fetch supports duplex
    duplex: body && body.byteLength > 0 ? 'half' : undefined
  });
  return buildGatewayResponse(gatewayResp);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
