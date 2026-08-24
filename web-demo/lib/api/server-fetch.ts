/**
 * Server-side fetch helper — 把 cookies() 注入 client.ts 的 fetch 管道。
 *
 * 用法:每个 server component 顶部 await 一次 `setupSsrCookies()`,
 * 之后所有通过 lib/api/*Api 调用的 fetch 都会自动带上 csrf_token + access_token。
 *
 * 实现:setupSsrCookies 读 cookies() 后调用 client.ts 的 setSsrCookieJar(),
 * 让 module-level _ssrCookieJar 被设置;所有 gatewayFetch 内部用 _ssrCookieJar
 * 注入 X-CSRF-Token + Cookie header(SSR 直连 gateway)。
 */
import 'server-only';
import { cookies } from 'next/headers';
import { gatewayFetch as _gatewayFetch, setSsrCookieJar } from './client';
import type { RequestOptions } from './types';

let _initialized = false;

/**
 * 在 server component 入口调用一次,把当前请求的 cookie 注入 fetch 管道。
 * 幂等:重复调用不会重复设置。
 */
export async function setupSsrCookies(): Promise<void> {
  if (_initialized) return;
  const store = await cookies();
  const parts: string[] = [];
  for (const { name, value } of store.getAll()) {
    parts.push(`${name}=${value}`);
  }
  const cookieStr = parts.join('; ');
  setSsrCookieJar(cookieStr);
  _initialized = true;
}

/**
 * 直接发请求(SSR-safe)。大部分场景用 setupSsrCookies() + 普通 *Api 即可。
 */
export async function serverFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  await setupSsrCookies();
  return _gatewayFetch<T>(path, options);
}

// 重新导出 domain API(让 server component 用 @/lib/api/server-fetch 一处导入)
export {
  authApi,
  agentsApi,
  modelsApi,
  threadsApi,
  runsApi,
  skillsApi,
  uploadsApi,
  memoryApi,
  mcpApi,
  toolsApi,
  channelsApi,
  schedulerApi,
  configApi
} from './index';

export { GatewayError } from './types';
export type { ApiError, Result, RequestOptions } from './types';
