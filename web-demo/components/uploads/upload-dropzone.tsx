'use client';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';
import { uploadsApi } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  thread_id: string;
}

export function UploadDropzone({ thread_id }: Props) {
  const queryClient = useQueryClient();
  const uploadMutation = useMutation({
    mutationFn: (files: File[]) =>
      Promise.all(files.map((f) => uploadsApi.upload(thread_id, f))),
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['uploads', thread_id] });
      toast.success(`上传成功(${results.length} 个文件)`);
    },
    onError: (e) => toast.error(`上传失败: ${(e as Error).message}`)
  });

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) return;
      uploadMutation.mutate(accepted);
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
          }`}
        >
          <input {...getInputProps()} />
          {uploadMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-sm font-medium">上传中…</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm font-medium">
                {isDragActive ? '松开鼠标上传' : '拖拽文件到此处,或点击选择'}
              </div>
              <div className="text-xs text-muted-foreground">
                上传到当前 thread · 智能预览会自动识别图片/PDF/Markdown/代码/JSON
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
