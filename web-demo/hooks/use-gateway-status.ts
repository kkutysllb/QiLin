'use client';
import { useEffect, useState } from 'react';
import { checkGatewayHealth } from '@/lib/gateway/health';

export function useGatewayStatus(intervalMs = 10000) {
  const [status, setStatus] = useState<'unknown' | 'ok' | 'down'>('unknown');
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const r = await checkGatewayHealth();
      if (active) setStatus(r.ok ? 'ok' : 'down');
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return status;
}
