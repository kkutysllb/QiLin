'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, File as FileIcon, Loader2 } from 'lucide-react';
import { uploadsApi } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function UploadDropzone() {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;
    setUploading(true);
    try {
      for (const file of accepted) {
        await uploadsApi.upload(file);
        toast.success(`${file.name} 上传成功`);
      }
      queryClient.invalidateQueries({ queryKey: ['uploads'] });
    } catch (e) {
      toast.error(`上传失败: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }, [queryClient]);

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
          {uploading ? (
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
                支持任意格式 · 智能预览会自动识别图片/PDF/Markdown/代码/JSON
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
