import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('gatewayFetch', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
  });

  it('builds URL with query params', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] })
    });
    const { gatewayFetch } = await import('@/lib/api/client');
    await gatewayFetch('/api/x', { query: { page: 2, page_size: 10 } });
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('page_size=10');
  });

  it('throws GatewayError on non-2xx', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'not found' })
    });
    const { gatewayFetch } = await import('@/lib/api/client');
    const { GatewayError } = await import('@/lib/api/types');
    await expect(gatewayFetch('/api/x')).rejects.toBeInstanceOf(GatewayError);
  });

  it('returns undefined on 204', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => null
    });
    const { gatewayFetch } = await import('@/lib/api/client');
    const result = await gatewayFetch('/api/x');
    expect(result).toBeUndefined();
  });
});
