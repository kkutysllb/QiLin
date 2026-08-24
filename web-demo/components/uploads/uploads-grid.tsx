'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCard } from './upload-card';
import { UploadDetailDrawer } from './upload-detail-drawer';
import { uploadsApi } from '@/lib/api';
import type { Upload as UploadType } from '@/lib/types';
import { EmptyState } from '@/components/shared/empty-state';
import { Upload as UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

export function UploadsGrid({ initial }: { initial: UploadType[] }) {
  const [selected, setSelected] = useState<UploadType | null>(null);
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => uploadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads'] });
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
              key={u.id}
              upload={u}
              onSelect={setSelected}
              onDelete={(f) => deleteMutation.mutate(f.id)}
            />
          ))}
        </div>
      )}
      <UploadDetailDrawer upload={selected} onClose={() => setSelected(null)} />
    </>
  );
}
