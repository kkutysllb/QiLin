'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, truncate } from '@/lib/utils';
import type { Run, RunStatus } from '@/lib/types';

const STATUS_VARIANT: Record<
  RunStatus,
  'default' | 'success' | 'warning' | 'destructive' | 'secondary'
> = {
  pending: 'secondary',
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary'
};

const columns: ColumnDef<Run, unknown>[] = [
  {
    accessorKey: 'run_id',
    header: 'Run ID',
    cell: ({ row }) => <code className="text-xs">{truncate(row.original.run_id, 16)}</code>
  },
  { accessorKey: 'agent_name', header: 'Agent' },
  {
    accessorKey: 'thread_id',
    header: 'Thread',
    cell: ({ row }) => truncate(row.original.thread_id, 12)
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
  },
  {
    accessorKey: 'total_tokens',
    header: 'Tokens',
    cell: ({ row }) => row.original.total_tokens ?? '—'
  },
  {
    accessorKey: 'updated_at',
    header: '更新时间',
    cell: ({ row }) => formatRelativeTime(row.original.updated_at)
  }
];

export function RunsTable({ data, onSelect }: { data: Run[]; onSelect?: (r: Run) => void }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      searchPlaceholder="搜索 run / agent…"
      onRowClick={onSelect}
    />
  );
}
