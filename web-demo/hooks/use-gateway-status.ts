'use client';
import { useEffect, useState } from 'react';
import { checkGatewayHealth } from '@/lib/gateway/health';

export type GatewayHealth = 'unknown' | 'ok' | 'down' | 'recovering';

/**
 * Gateway 健康状态轮询 hook(每 10 秒一次)。
 *
 * 行为:
 * - 初始 'unknown',不触发横幅
 * - 'ok' → 'down':立即显示横幅
 * - 'down' → 'ok':标记 'recovering',横幅保留,下次 ping 仍 ok 才清除
 *
 * 这样可以避免以下误报:
 * - 页面首次加载时的瞬时网络抖动
 * - Gateway 重启时的短暂 down 期间
 * - 浏览器 background tab 唤醒后的首轮 ping
 */
export function useGatewayStatus(intervalMs = 10000): GatewayHealth {
  const [status, setStatus] = useState<GatewayHealth>('unknown');
  useEffect(() => {
    let active = true;
    let consecutiveFailures = 0;
    let prev: GatewayHealth = 'unknown';

    const tick = async () => {
      const r = await checkGatewayHealth();
      if (!active) return;
      if (r.ok) {
        consecutiveFailures = 0;
        // 从 down 恢复到 ok:先标记 recovering 让横幅保留可见,下次 tick 仍 ok 才清除
        if (prev === 'down') {
          prev = 'recovering';
          setStatus('recovering');
          // 5 秒后再 ping 一次以确认稳定
          setTimeout(() => {
            if (active) {
              checkGatewayHealth().then((r2) => {
                if (active && r2.ok) setStatus('ok');
              });
            }
          }, 5000);
        } else if (prev !== 'recovering') {
          setStatus('ok');
          prev = 'ok';
        }
      } else {
        consecutiveFailures += 1;
        // 连续 2 次失败才标记 down(避免单次网络抖动误报)
        if (consecutiveFailures >= 2 || prev === 'down') {
          prev = 'down';
          setStatus('down');
        }
      }
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
