'use client';
import { GatewayError } from '@/lib/api/types';

const REDIRECT_FLAG = 'qilin-401-redirected';

export function shouldRedirectToLogin(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(REDIRECT_FLAG)) return false;
  if (error instanceof GatewayError && error.apiError.status === 401) {
    sessionStorage.setItem(REDIRECT_FLAG, '1');
    return true;
  }
  return false;
}

export function clearRedirectFlag() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(REDIRECT_FLAG);
}
