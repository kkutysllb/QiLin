'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h1 className="mb-2 text-xl font-semibold">出错了</h1>
        <p className="mb-1 text-sm text-muted-foreground">{error.message}</p>
        {error.digest && <p className="mb-4 text-xs text-muted-foreground">错误 ID: {error.digest}</p>}
        <Button onClick={() => reset()}>重试</Button>
      </div>
    </div>
  );
}
