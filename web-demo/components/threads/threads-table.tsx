'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, truncate } from '@/lib/utils';
import type { Thread } from '@/lib/types';

const columns: ColumnDef<Thread, unknown>[] = [
  {
    accessorKey: 'thread_id',
    header: 'Thread ID',
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {truncate(row.original.thread_id, 20)}
      </code>
    )
  },
  { accessorKey: 'title', header: '标题', cell: ({ row }) => row.original.title ?? '—' },
  {
    accessorKey: 'updated_at',
    header: '最后活动',
    cell: ({ row }) => formatRelativeTime(row.original.updated_at)
  },
  {
    accessorKey: 'metadata',
    header: '元数据',
    cell: ({ row }) => {
      const keys = Object.keys(row.original.metadata ?? {});
      return keys.length > 0 ? <Badge variant="outline">{keys.length}</Badge> : '—';
    }
  }
];

export function ThreadsTable({
  data,
  onSelect
}: {
  data: Thread[];
  onSelect?: (t: Thread) => void;
}) {
  return (
    <DataTable
      data={data}
      columns={columns}
      searchPlaceholder="搜索 thread_id / 标题…"
      onRowClick={onSelect}
    />
  );
}
