/**
 * OAuth state 生成与校验 — 防止 CSRF
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 分钟

export interface OAuthState {
  nonce: string;
  createdAt: number;
  /** 回跳 URL,授权完成后跳转到这里 */
  returnTo: string;
}

export function generateOAuthState(returnTo = '/'): OAuthState {
  // 64 hex chars = 256 bits,加密学强度足够
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { nonce, createdAt: Date.now(), returnTo };
}

export function isStateValid(state: OAuthState | null, nonce: string | null): boolean {
  if (!state || !nonce) return false;
  if (state.nonce !== nonce) return false;
  if (Date.now() - state.createdAt > STATE_TTL_MS) return false;
  return true;
}

export function serializeState(state: OAuthState): string {
  return JSON.stringify(state);
}

export function deserializeState(text: string | null): OAuthState | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as OAuthState;
  } catch {
    return null;
  }
}
