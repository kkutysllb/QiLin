import { uploadsApi } from '@/lib/api';
import { UploadDropzone } from '@/components/uploads/upload-dropzone';
import { UploadsGrid } from '@/components/uploads/uploads-grid';
import type { Upload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UploadsPage() {
  const result = await uploadsApi
    .list({ page: 1, page_size: 100 })
    .catch(() => ({ items: [] as Upload[], total: 0, page: 1, page_size: 100 }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">上传</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用户文件管理 — 支持任意格式,智能预览(共 {result.items.length} 个)
        </p>
      </div>
      <UploadDropzone />
      <UploadsGrid initial={result.items} />
    </div>
  );
}
