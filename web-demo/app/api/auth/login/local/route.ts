/**
 * 登录 proxy — 把 gateway (8081) 颁发的 cookie 镜像到 web-demo (3000) 域名下。
 *
 * 问题:Gateway 的 Set-Cookie 默认 host-only (host=127.0.0.1),浏览器对
 * 127.0.0.1 多端口 host-only cookie 的跨端口传递行为不一致 — 有的浏览器
 * 会带过去,有的不会。结果 web-demo 的 server route handler cookies() 读不到
 * access_token,proxy 报 401。
 *
 * 修法:浏览器 POST 到 /api/auth/login/local(同源),proxy route 用 server-side
 * fetch 调 gateway,从 response.headers.getSetCookie() 拿 csrf_token +
 * access_token,NextResponse.cookies.set() 写到 web-demo 自己的 Set-Cookie
 * 响应里。浏览器存的是同源 cookie,fetch /api/proxy 时 cookies() 一定能读到。
 */
import { NextResponse } from 'next/server';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';

interface LoginBody {
  username: string;
  password: string;
  remember_me?: boolean;
}

const COOKIE_NAMES = ['csrf_token', 'access_token', 'qilin_session_persistent'] as const;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as LoginBody;
  if (!body.username || !body.password) {
    return NextResponse.json(
      { detail: 'username and password required' },
      { status: 400 }
    );
  }

  // gateway 用 OAuth2PasswordRequestForm(form-encoded)
  const form = new URLSearchParams();
  form.set('username', body.username);
  form.set('password', body.password);
  if (body.remember_me !== undefined) form.set('remember_me', String(body.remember_me));

  let resp: Response;
  try {
    resp = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/login/local`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: form.toString(),
      cache: 'no-store'
    });
  } catch (e) {
    return NextResponse.json(
      { detail: 'gateway unreachable', message: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  const respBody = await resp.json().catch(() => ({}));

  // 失败:不写 cookie,直接把 gateway 错误透传给前端
  if (!resp.ok) {
    return NextResponse.json(respBody, { status: resp.status });
  }

  // 成功:从 gateway Set-Cookie 解析并镜像到 web-demo 自己域名
  const setCookies = resp.headers.getSetCookie();
  const out = NextResponse.json(respBody, { status: resp.ok ? 200 : resp.status });
  for (const sc of setCookies) {
    // 解析 "name=value; Path=/; HttpOnly; Max-Age=..." 形式
    const parts = sc.split(';').map((s) => s.trim());
    const firstPart = parts[0];
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx < 0) continue;
    const name = firstPart.slice(0, eqIdx).trim();
    const value = firstPart.slice(eqIdx + 1).trim();
    if (!COOKIE_NAMES.includes(name as (typeof COOKIE_NAMES)[number])) continue;

    // 解析 attributes
    const attrs: { maxAge?: number; httpOnly?: boolean; sameSite?: 'lax' | 'strict' | 'none'; path?: string; secure?: boolean } = {};
    for (const part of parts.slice(1)) {
      const [k, v] = part.split('=').map((s) => s.trim());
      const lk = k.toLowerCase();
      if (lk === 'max-age') attrs.maxAge = Number(v);
      else if (lk === 'httponly') attrs.httpOnly = true;
      else if (lk === 'secure') attrs.secure = true;
      else if (lk === 'samesite') {
        const v2 = (v ?? '').toLowerCase();
        if (v2 === 'lax' || v2 === 'strict' || v2 === 'none') attrs.sameSite = v2;
      } else if (lk === 'path') attrs.path = v;
    }

    // 写到 web-demo 自己的 cookie。SameSite 改 Lax(原本 Strict 在跨页跳转时会被丢弃)
    out.cookies.set({
      name,
      value,
      path: attrs.path ?? '/',
      httpOnly: attrs.httpOnly ?? false,
      secure: attrs.secure ?? false,
      sameSite: attrs.sameSite ?? 'lax',
      maxAge: attrs.maxAge
    });
  }

  return out;
}
