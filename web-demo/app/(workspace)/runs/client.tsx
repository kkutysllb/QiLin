'use client';
import { useState } from 'react';
import { RunsTable } from '@/components/runs/runs-table';
import { RunDetailDrawer } from '@/components/runs/run-detail-drawer';
import { EmptyState } from '@/components/shared/empty-state';
import type { Run } from '@/lib/types';
import { Activity } from 'lucide-react';

export function RunsClient({ initial }: { initial: Run[] }) {
  const [selected, setSelected] = useState<Run | null>(null);
  return (
    <>
      {initial.length === 0 ? (
        <EmptyState icon={Activity} title="还没有运行" description="开始对话后,这里会显示运行历史" />
      ) : (
        <RunsTable data={initial} onSelect={setSelected} />
      )}
      <RunDetailDrawer run={selected} onClose={() => setSelected(null)} />
    </>
  );
}
