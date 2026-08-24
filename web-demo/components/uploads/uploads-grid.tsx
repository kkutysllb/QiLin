'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCard } from './upload-card';
import { UploadDetailDrawer } from './upload-detail-drawer';
import { uploadsApi } from '@/lib/api';
import type { Upload } from '@/lib/types';
import { EmptyState } from '@/components/shared/empty-state';
import { Upload as UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  initial: Upload[];
  thread_id: string;
}

export function UploadsGrid({ initial, thread_id }: Props) {
  const [selected, setSelected] = useState<Upload | null>(null);
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (filename: string) => uploadsApi.delete(thread_id, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads', thread_id] });
      toast.success('文件已删除');
    },
    onError: (e) => toast.error(`删除失败: ${(e as Error).message}`)
  });

  return (
    <>
      {initial.length === 0 ? (
        <EmptyState
          icon={UploadIcon}
          title="还没有上传文件"
          description="使用上方拖拽区域上传第一个文件"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {initial.map((u) => (
            <UploadCard
              key={u.filename}
              upload={u}
              thread_id={thread_id}
              onSelect={setSelected}
              onDelete={(f) => deleteMutation.mutate(f.filename)}
            />
          ))}
        </div>
      )}
      <UploadDetailDrawer
        upload={selected}
        thread_id={thread_id}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
