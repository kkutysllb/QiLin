/**
 * Server-side fetch helper — 把浏览器请求的 cookie 注入到 client.ts 的 fetch 管道。
 *
 * 用法:每个 server component 顶部 await 一次 `setupSsrCookies()`,
 * 之后所有通过 lib/api/*Api 调用的 fetch 都会自动带上 csrf_token + access_token。
 *
 * 实现原理:client.ts 内部有一个 `_ssrCookieJar` 变量,setSsrCookieJar() 设置它,
 * 然后 getCsrfToken() 既能从 document.cookie(浏览器)也能从 _ssrCookieJar(SSR)读 csrf_token。
 *
 * 同时,我们也提供 serverFetch 给极少数不能依赖 module-level 状态的特殊场景(比如
 * 中途动态切换 cookie)。日常使用 setupSsrCookies() 即可。
 */
import 'server-only';
import { cookies } from 'next/headers';
import { setSsrCookieJar, gatewayFetch as _gatewayFetch } from './client';
import type { RequestOptions } from './types';

let _initialized = false;

/**
 * 在 server component 入口调用一次,把当前请求的 cookie 注入 fetch 管道。
 * 幂等:重复调用不会重复设置。
 */
export async function setupSsrCookies(): Promise<void> {
  if (_initialized) return;
  const store = await cookies();
  setSsrCookieJar(store.toString());
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
  toolsApi
} from './index';

export { GatewayError } from './types';
export type { ApiError, Result, RequestOptions } from './types';
