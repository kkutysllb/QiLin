import { checkGatewayHealth } from '@/lib/gateway/health';

export async function GatewayHealthGate({ children }: { children: React.ReactNode }) {
  const status = await checkGatewayHealth();
  if (!status.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="mb-3 text-3xl">⚠️</div>
          <h1 className="mb-2 text-xl font-semibold">QiLin Gateway 未就绪</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Web Demo 需要连接到 QiLin Gateway 才能运行。当前健康检查失败:
          </p>
          <pre className="rounded-md bg-muted p-3 text-left text-xs">
            {JSON.stringify(status, null, 2)}
          </pre>
          <p className="mt-4 text-xs text-muted-foreground">
            请在 QiLin 仓库根目录运行:{' '}
            <code className="rounded bg-muted px-1">uvicorn app.gateway.app:app --port 8080</code>
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
