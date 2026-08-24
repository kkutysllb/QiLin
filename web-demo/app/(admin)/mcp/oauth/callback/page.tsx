'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * OAuth Callback 页面
 *
 * Gateway OAuth 流程完成后会重定向到本页面,带上 ?code=&state=&server=
 * 本页面将授权码提交给 Gateway 完成 token 交换,然后跳转回 /mcp。
 *
 * 注意:Gateway 端才是真正的 token 接收者(需要 session 关联);
 * 本页面只是一个用户友好的回跳 UI。
 */
export default function McpOAuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code');
  const state = params.get('state');
  const server = params.get('server');
  const error = params.get('error');

  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>(
    error ? 'failed' : code ? 'pending' : 'failed'
  );
  const [message, setMessage] = useState(error ? `OAuth 错误: ${error}` : '');

  useEffect(() => {
    if (status !== 'pending') return;
    // 实际 token 交换已经在 Gateway callback 中完成(网关端 cookie session 关联)
    // 这里只需要给用户一个完成提示
    setStatus('success');
    setMessage(`服务器 "${server ?? '?'}" 授权成功`);
    const t = setTimeout(() => router.push('/mcp'), 2000);
    return () => clearTimeout(t);
  }, [status, server, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'pending' && (
            <>
              <Loader2 className="mx-auto mb-2 h-10 w-10 animate-spin text-muted-foreground" />
              <CardTitle>OAuth 授权处理中…</CardTitle>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-qilin-400" />
              <CardTitle>授权成功</CardTitle>
            </>
          )}
          {status === 'failed' && (
            <>
              <XCircle className="mx-auto mb-2 h-10 w-10 text-destructive" />
              <CardTitle>授权失败</CardTitle>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {server && (
            <p className="text-xs text-muted-foreground">
              server: <code className="rounded bg-muted px-1">{server}</code>
            </p>
          )}
          {state && (
            <p className="text-[10px] text-muted-foreground">
              state: <code className="rounded bg-muted px-1">{state.slice(0, 16)}…</code>
            </p>
          )}
          <Button onClick={() => router.push('/mcp')}>返回 MCP 页面</Button>
        </CardContent>
      </Card>
    </div>
  );
}
