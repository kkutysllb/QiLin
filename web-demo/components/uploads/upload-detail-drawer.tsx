'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/utils';
import type { Upload } from '@/lib/types';
import { PreviewRenderer } from './preview-renderer';
import { detectPreview } from '@/lib/preview/detect';

interface Props {
  upload: Upload | null;
  thread_id: string;
  onClose: () => void;
}

export function UploadDetailDrawer({ upload, thread_id, onClose }: Props) {
  if (!upload) {
    return (
      <Dialog open={false} onOpenChange={onClose}>
        <DialogContent />
      </Dialog>
    );
  }
  const preview = detectPreview(upload.filename, upload.mime_type);
  return (
    <Dialog open={!!upload} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{upload.filename}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{preview.kind}</Badge>
            <span>{upload.mime_type || 'unknown'}</span>
            <span>· {(upload.size / 1024).toFixed(1)} KB</span>
            <span>· {formatDateTime(upload.uploaded_at)}</span>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <PreviewRenderer
            thread_id={thread_id}
            filename={upload.filename}
            mimeType={upload.mime_type}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
