'use client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGatewayStatus } from '@/hooks/use-gateway-status';
import { WifiOff, Loader2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConnectionBanner() {
  const status = useGatewayStatus();
  if (status === 'ok' || status === 'unknown') return null;

  if (status === 'recovering') {
    return (
      <div className="sticky top-14 z-20 px-4 pt-2">
        <Alert className="border-qilin-500/40 bg-qilin-500/5">
          <Loader2 className="h-4 w-4 animate-spin text-qilin-400" />
          <AlertTitle className="text-qilin-100">Gateway 已恢复</AlertTitle>
          <AlertDescription>
            正在确认连接稳定… 5 秒后再验证一次。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // status === 'down'
  return (
    <div className="sticky top-14 z-20 px-4 pt-2">
      <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Gateway 连接已断开</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>实时数据可能过期。系统将每 10 秒自动重连,请检查 uvicorn 是否在运行。</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="shrink-0"
          >
            <Wifi className="mr-1 h-3 w-3" />
            立即重连
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
