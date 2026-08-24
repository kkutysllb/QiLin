'use client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGatewayStatus } from '@/hooks/use-gateway-status';
import { WifiOff } from 'lucide-react';

export function ConnectionBanner() {
  const status = useGatewayStatus();
  if (status !== 'down') return null;
  return (
    <div className="sticky top-14 z-20 px-4 pt-2">
      <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Gateway 连接已断开</AlertTitle>
        <AlertDescription>
          实时数据可能过期。系统将自动重连,请检查 uvicorn 是否在运行。
        </AlertDescription>
      </Alert>
    </div>
  );
}
