'use client';
import { useState } from 'react';
import { ThreadsTable } from '@/components/threads/threads-table';
import { ThreadDetailDrawer } from '@/components/threads/thread-detail-drawer';
import { EmptyState } from '@/components/shared/empty-state';
import type { Thread } from '@/lib/types';
import { MessageSquare } from 'lucide-react';

export function ThreadsClient({ initial }: { initial: Thread[] }) {
  const [selected, setSelected] = useState<Thread | null>(null);
  return (
    <>
      {initial.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="还没有线程"
          description="前往「对话」页面创建第一个对话"
        />
      ) : (
        <ThreadsTable data={initial} onSelect={setSelected} />
      )}
      <ThreadDetailDrawer thread={selected} onClose={() => setSelected(null)} />
    </>
  );
}
