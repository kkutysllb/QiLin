import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('checkGatewayHealth', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
  });

  it('returns ok when gateway responds 200', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy', version: '2.0.0' })
    });
    const { checkGatewayHealth } = await import('@/lib/gateway/health');
    const result = await checkGatewayHealth();
    expect(result.ok).toBe(true);
    expect(result.version).toBe('2.0.0');
  });

  it('returns error when fetch throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('ECONNREFUSED')
    );
    const { checkGatewayHealth } = await import('@/lib/gateway/health');
    const result = await checkGatewayHealth();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
