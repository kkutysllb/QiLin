import { GATEWAY_BASE_URL, API_TIMEOUT_MS } from '@/lib/gateway/config';
import { GatewayError, type ApiError, type RequestOptions } from './types';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * SSR-only:由 server-fetch 在每个请求入口注入 cookie 字符串,让 server-side fetch
 * 能拿到 csrf_token 并附 X-CSRF-Token header。浏览器端永远用 document.cookie,
 * 这个变量是 null。
 */
let _ssrCookieJar: string | null = null;

export function setSsrCookieJar(cookies: string | null): void {
  _ssrCookieJar = cookies;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${GATEWAY_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** 从 document.cookie(浏览器)或预注入的 cookie jar(SSR)读取 csrf_token */
function getCsrfToken(): string | null {
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  if (_ssrCookieJar) {
    const m = _ssrCookieJar.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/** 判断是否需要 CSRF:非 auth 端点 + 非 GET/HEAD/OPTIONS */
function needsCsrf(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  // auth 端点自身不需要 CSRF(否则登录会失败),但其他都需要
  if (path.startsWith('/api/v1/auth/')) return false;
  return true;
}

export async function gatewayFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, query, signal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  // 自动注入 CSRF token(Gateway v2.0.0 cookie auth 的双提交要求)
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers
  };
  if (needsCsrf(method, path)) {
    const csrf = getCsrfToken();
    if (csrf) finalHeaders[CSRF_HEADER_NAME] = csrf;
  }

  // SSR 时 fetch 没有浏览器 cookie jar,需要手动把整条 cookie 串传过去
  // (否则 gateway 鉴权失败,因为 cookie-based auth 要求 access_token cookie)
  const isSsr = _ssrCookieJar !== null;

  try {
    const res = await fetch(buildUrl(path, query), {
      method,
      headers: isSsr ? { ...finalHeaders, Cookie: _ssrCookieJar ?? '' } : finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: isSsr ? 'omit' : 'include',
      cache: 'no-store'
    });

    if (!res.ok) {
      let apiError: ApiError;
      try {
        const data = (await res.json()) as Record<string, unknown>;
        apiError = {
          message: (data.message as string) ?? (data.detail as string) ?? `HTTP ${res.status}`,
          code: (data.code as string) ?? `HTTP_${res.status}`,
          request_id: data.request_id as string | undefined,
          status: res.status
        };
      } catch {
        apiError = { message: `HTTP ${res.status}`, code: `HTTP_${res.status}`, status: res.status };
      }

      // 401 → 客户端跳转登录(避免循环:在 /login 页面不发触发)
      if (
        res.status === 401 &&
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/api/')
      ) {
        try {
          const flagKey = 'qilin-401-redirected';
          if (!sessionStorage.getItem(flagKey)) {
            sessionStorage.setItem(flagKey, '1');
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?next=${next}`;
          }
        } catch {
          /* ignore sessionStorage errors */
        }
      }

      throw new GatewayError(apiError);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function gatewayFetchRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET';
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (needsCsrf(method, path)) {
    const csrf = getCsrfToken();
    if (csrf) finalHeaders[CSRF_HEADER_NAME] = csrf;
  }
  return fetch(buildUrl(path, options.query), {
    method,
    headers: finalHeaders,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'include'
  });
}
