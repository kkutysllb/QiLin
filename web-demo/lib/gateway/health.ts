import { GATEWAY_BASE_URL } from './config';

export interface HealthStatus {
  ok: boolean;
  status: string;
  version?: string;
  latency_ms: number;
  error?: string;
}

export async function checkGatewayHealth(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store'
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      return { ok: false, status: 'unhealthy', latency_ms, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { status?: string; version?: string };
    return { ok: true, status: data.status ?? 'healthy', version: data.version, latency_ms };
  } catch (err) {
    const latency_ms = Date.now() - start;
    return { ok: false, status: 'unreachable', latency_ms, error: (err as Error).message };
  }
}
