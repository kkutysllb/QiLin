'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { threadsApi } from '@/lib/api';
import { Loader2, AlertCircle } from 'lucide-react';

export function NewChatClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // React StrictMode 在 dev 下会触发两次 effect,ran 保证只创建一次
    if (ran.current) return;
    ran.current = true;
    threadsApi
      .create({ title: '新对话' })
      .then((thread) => {
        router.replace(`/chat/${encodeURIComponent(thread.thread_id)}`);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      });
  }, [router]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">创建对话失败</h3>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <button
                onClick={() => router.replace('/login?next=/chat')}
                className="mt-4 text-sm underline"
              >
                返回登录
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>正在创建新对话...</span>
      </div>
    </div>
  );
}
