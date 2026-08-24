import type { ApiError } from '@/lib/types';

export type { ApiError, Result } from '@/lib/types';

export class GatewayError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
    this.name = 'GatewayError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * Server-side 用:把 Next.js `cookies()` 读到的 cookie 字符串注入到 fetch。
   * 浏览器端忽略此字段(浏览器自动带 cookie)。
   * 例:`import { cookies } from 'next/headers'; cookies: cookies().toString()`
   */
  cookies?: string;
}
