import { setupSsrCookies, threadsApi, uploadsApi } from '@/lib/api/server-fetch';
import { UploadDropzone } from '@/components/uploads/upload-dropzone';
import { UploadsGrid } from '@/components/uploads/uploads-grid';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function UploadsPage() {
  await setupSsrCookies();
  // uploads 必须绑定 thread — 默认用最近活跃的 thread
  const threads = await threadsApi.list({ limit: 1 }).catch(() => []);
  const activeThread = threads[0];

  if (!activeThread) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">上传</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用户文件管理 — 支持任意格式,智能预览
          </p>
        </div>
        <EmptyState
          icon={MessageSquare}
          title="还没有对话线程"
          description="上传功能需要绑定到一个对话线程。请先创建一个对话。"
        >
          <Link href="/chat">
            <Button>
              <MessageSquare className="mr-2 h-4 w-4" />
              去创建对话
            </Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  const result = await uploadsApi
    .list(activeThread.thread_id)
    .catch(() => ({ files: [] as Array<{ filename: string; virtual_path: string; size: number; mime_type: string; uploaded_at: string }>, count: 0 }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">上传</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          绑定到最近活跃 thread(
          <code className="rounded bg-muted px-1 text-xs">
            {activeThread.thread_id.slice(0, 16)}…
          </code>
          )· 共 {result.count} 个文件 ·{' '}
          <Link href="/chat" className="text-qilin-400 underline-offset-4 hover:underline">
            切换 thread
          </Link>
        </p>
      </div>
      <UploadDropzone thread_id={activeThread.thread_id} />
      <UploadsGrid initial={result.files} thread_id={activeThread.thread_id} />
    </div>
  );
}
