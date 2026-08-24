'use client';
import type { Upload } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { detectPreview } from '@/lib/preview/detect';
import { formatRelativeTime } from '@/lib/utils';
import { FileText, Image as ImageIcon, FileCode, Eye, Download, Trash2, FileType } from 'lucide-react';

const ICON_BY_KIND = {
  image: ImageIcon,
  code: FileCode,
  pdf: FileType,
  text: FileText,
  markdown: FileText,
  json: FileCode,
  audio: FileType,
  video: FileType,
  unsupported: FileText
} as const;

interface Props {
  upload: Upload;
  onSelect?: (u: Upload) => void;
  onDelete?: (u: Upload) => void;
}

export function UploadCard({ upload, onSelect, onDelete }: Props) {
  const preview = detectPreview(upload.filename, upload.mime_type);
  const Icon = ICON_BY_KIND[preview.kind];
  const sizeKB = (upload.size / 1024).toFixed(1);
  return (
    <Card className="group transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" title={upload.filename}>
              {upload.filename}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {preview.kind}
              </Badge>
              <span>{sizeKB} KB</span>
              <span>·</span>
              <span>{upload.mime_type || 'unknown'}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatRelativeTime(upload.uploaded_at)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onSelect?.(upload)}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            预览
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a
              href={`${process.env.NEXT_PUBLIC_GATEWAY_BASE_URL ?? 'http://127.0.0.1:8081'}/api/uploads/${encodeURIComponent(upload.id)}/raw`}
              download
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete?.(upload)}
            aria-label="删除"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
