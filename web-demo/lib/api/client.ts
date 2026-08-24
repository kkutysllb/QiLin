import { API_TIMEOUT_MS, GATEWAY_BASE_URL } from '@/lib/gateway/config';
import { GatewayError, type ApiError, type RequestOptions } from './types';

const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Module-level SSR cookie jar — 由 setupSsrCookies() 在 server component
 * 入口注入一次,所有后续 gatewayFetch 调用都能自动拿到 csrf_token + access_token。
 * 浏览器端永远是 null(浏览器走 /api/proxy)。
 */
let _ssrCookieJar: string | null = null;

export function setSsrCookieJar(cookies: string | null): void {
  _ssrCookieJar = cookies;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  if (/^https?:/i.test(path)) return path; // 绝对 URL 透传
  let finalPath = path;
  if (isBrowser() && path.startsWith('/api/')) {
    finalPath = '/api/proxy' + path;
  }
  const base = isBrowser() ? 'http://x' : GATEWAY_BASE_URL;
  const url = new URL(finalPath, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  if (isBrowser()) return url.pathname + url.search;
  return url.toString();
}

/** 判断是否需要 CSRF:非 auth 端点 + 非 GET/HEAD/OPTIONS */
function needsCsrf(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (path.startsWith('/api/v1/auth/')) return false;
  return true;
}

export async function gatewayFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, query, signal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers
  };

  // SSR 直连时,从 module-level cookie jar 注入 csrf + Cookie header
  const cookies = _ssrCookieJar;
  if (!isBrowser() && cookies) {
    if (needsCsrf(method, path)) {
      const m = cookies.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      if (m) finalHeaders[CSRF_HEADER_NAME] = decodeURIComponent(m[1]);
    }
    finalHeaders['Cookie'] = cookies;
  }

  try {
    const res = await fetch(buildUrl(path, query), {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: isBrowser() ? 'include' : 'omit',
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
  return fetch(buildUrl(path, options.query), {
    method,
    headers: finalHeaders,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'include'
  });
}

// CSRF header name re-exported for completeness (some non-auth endpoints may need it
// if called outside the proxy path — currently unused but kept for future use)
export { CSRF_HEADER_NAME, buildUrl, needsCsrf };
