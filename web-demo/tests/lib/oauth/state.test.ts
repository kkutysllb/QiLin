import { describe, it, expect } from 'vitest';
import { generateOAuthState, isStateValid, serializeState, deserializeState } from '@/lib/oauth/state';

describe('OAuth state', () => {
  it('generates a 64-hex-char nonce', () => {
    const s = generateOAuthState();
    expect(s.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(s.returnTo).toBe('/');
  });
  it('accepts custom returnTo', () => {
    const s = generateOAuthState('/mcp');
    expect(s.returnTo).toBe('/mcp');
  });
  it('round-trips serialization', () => {
    const s = generateOAuthState('/foo');
    const back = deserializeState(serializeState(s));
    expect(back).toEqual(s);
  });
  it('validates matching nonce', () => {
    const s = generateOAuthState();
    expect(isStateValid(s, s.nonce)).toBe(true);
  });
  it('rejects mismatched nonce', () => {
    const s = generateOAuthState();
    expect(isStateValid(s, 'bad')).toBe(false);
  });
  it('rejects expired state', () => {
    const s = { ...generateOAuthState(), createdAt: Date.now() - 11 * 60 * 1000 };
    expect(isStateValid(s, s.nonce)).toBe(false);
  });
  it('rejects null state', () => {
    expect(isStateValid(null, 'x')).toBe(false);
  });
  it('deserializes invalid JSON safely', () => {
    expect(deserializeState('not-json')).toBeNull();
    expect(deserializeState(null)).toBeNull();
  });
});
