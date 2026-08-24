import { gatewayFetch } from './client';

export interface LoginInput {
  username: string;
  password: string;
}

export interface SessionUser {
  id: string;
  username: string;
  email?: string;
  role: string;
  is_internal?: boolean;
}

export const authApi = {
  login: (input: LoginInput) =>
    gatewayFetch<SessionUser>('/api/auth/login', { method: 'POST', body: input }),
  logout: () => gatewayFetch<void>('/api/auth/logout', { method: 'POST' }),
  me: () => gatewayFetch<SessionUser>('/api/auth/me'),
  register: (input: LoginInput & { email?: string }) =>
    gatewayFetch<SessionUser>('/api/auth/register', { method: 'POST', body: input })
};
