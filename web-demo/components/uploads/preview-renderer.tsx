'use client';
import { useEffect, useState } from 'react';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import { detectPreview, type PreviewInfo } from '@/lib/preview/detect';
import { FileText, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  /** upload 所属 thread_id(Gateway uploads 必须绑定 thread) */
  thread_id: string;
  /** upload.filename */
  filename: string;
  /** upload.mime_type */
  mimeType: string;
}

export function PreviewRenderer({ thread_id, filename, mimeType }: Props) {
  const info: PreviewInfo = detectPreview(filename, mimeType);
  const url = `${GATEWAY_BASE_URL}/api/threads/${encodeURIComponent(
    thread_id
  )}/uploads/${encodeURIComponent(filename)}/raw`;
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!info.inline) return;
    if (
      info.kind === 'image' ||
      info.kind === 'pdf' ||
      info.kind === 'audio' ||
      info.kind === 'video'
    )
      return;
    setLoading(true);
    setError(null);
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setText)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [url, info.inline, info.kind]);

  if (info.kind === 'unsupported' || !info.inline) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {filename} · {(mimeType || 'unknown')}
        </p>
        <p className="text-xs text-muted-foreground">此类型不支持 inline 预览</p>
        <Button asChild size="sm">
          <a href={url} download>
            <Download className="mr-2 h-4 w-4" />下载
          </a>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        预览加载失败: {error}
      </div>
    );
  }

  switch (info.kind) {
    case 'image':
      return (
        <img
          src={url}
          alt={filename}
          className="max-h-[60vh] w-full rounded-md object-contain"
        />
      );
    case 'pdf':
      return <iframe src={url} title={filename} className="h-[60vh] w-full rounded-md border" />;
    case 'audio':
      return <audio src={url} controls className="w-full" />;
    case 'video':
      return <video src={url} controls className="max-h-[60vh] w-full rounded-md" />;
    case 'markdown':
      return (
        <div className="prose prose-sm prose-invert max-w-none rounded-md border bg-muted/30 p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text ?? ''}</ReactMarkdown>
        </div>
      );
    case 'json':
      return (
        <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
          {text ? JSON.stringify(JSON.parse(text), null, 2) : ''}
        </pre>
      );
    case 'code':
      return (
        <pre
          className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs"
          data-language={info.hint}
        >
          {text ?? ''}
        </pre>
      );
    case 'text':
      return (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
          {text ?? ''}
        </pre>
      );
  }
}
