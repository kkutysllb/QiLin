import { GATEWAY_BASE_URL, API_TIMEOUT_MS } from '@/lib/gateway/config';
import { GatewayError, type ApiError, type RequestOptions } from './types';

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${GATEWAY_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function gatewayFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, query, signal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(buildUrl(path, query), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'include',
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
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'include'
  });
}
