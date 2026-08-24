import { gatewayFetch } from './client';

export interface LoginInput {
  username: string;
  password: string;
}

export interface SessionUser {
  id: string;
  username?: string;
  email?: string;
  system_role: 'admin' | 'user' | 'internal' | string;
  needs_setup?: boolean;
}

export interface SetupStatus {
  needs_setup: boolean;
  registration_enabled: boolean;
}

export const authApi = {
  /** 检查系统是否需要初始化(无 admin 时返回 needs_setup=true) */
  setupStatus: () => gatewayFetch<SetupStatus>('/api/v1/auth/setup-status'),
  /** 列出可用的 auth providers(local / OIDC 等) */
  providers: () =>
    gatewayFetch<Array<{ id: string; name: string; type: string }>>(
      '/api/v1/auth/providers'
    ),
  /** 本地账户登录(用户名 + 密码,OAuth2 form-encoded) */
  login: async (input: LoginInput): Promise<SessionUser> => {
    const body = new URLSearchParams({
      username: input.username,
      password: input.password
    });
    const { GATEWAY_BASE_URL } = await import('@/lib/gateway/config');
    const r = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/login/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'include'
    });
    if (!r.ok) {
      const detail = await r.json().catch(() => ({}));
      const msg =
        detail?.detail?.message ??
        (typeof detail?.detail === 'string' ? detail.detail : `HTTP ${r.status}`);
      throw new Error(msg);
    }
    return (await r.json()) as SessionUser;
  },
  /** 登出 */
  logout: () => gatewayFetch<void>('/api/v1/auth/logout', { method: 'POST' }),
  /** 获取当前 session 用户 */
  me: () => gatewayFetch<SessionUser>('/api/v1/auth/me'),
  /** 首次启动初始化 admin(无 admin 时才能调用) */
  initialize: (input: { email: string; password: string }) =>
    gatewayFetch<SessionUser>('/api/v1/auth/initialize', {
      method: 'POST',
      body: input
    }),
  /** 修改密码(已登录) */
  changePassword: (input: { current_password: string; new_password: string }) =>
    gatewayFetch<{ message: string }>('/api/v1/auth/change-password', {
      method: 'POST',
      body: input
    })
};
