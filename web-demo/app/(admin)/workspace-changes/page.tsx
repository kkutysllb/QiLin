import { WorkspaceChangesClient } from './client';

export const dynamic = 'force-dynamic';

export default function WorkspaceChangesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">工作区变更</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agent 在 Run 过程中对沙箱工作区的文件新增 / 修改 / 删除
        </p>
      </div>
      <WorkspaceChangesClient />
    </div>
  );
}