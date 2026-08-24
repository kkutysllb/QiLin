'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { MemoryFact } from '@/lib/api/memory';

interface Props {
  data: MemoryFact[];
  onDelete?: (fact: MemoryFact) => void;
  onSelect?: (fact: MemoryFact) => void;
}

export function MemoryFactsTable({ data, onDelete, onSelect }: Props) {
  const columns: ColumnDef<MemoryFact, unknown>[] = [
    {
      accessorKey: 'content',
      header: '事实内容',
      cell: ({ row }) => (
        <span className="line-clamp-2 text-xs">{truncate(row.original.content, 100)}</span>
      )
    },
    {
      accessorKey: 'category',
      header: '分类',
      cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge>
    },
    {
      accessorKey: 'confidence',
      header: '置信度',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-qilin-500"
              style={{ width: `${row.original.confidence * 100}%` }}
            />
          </div>
          <span className="text-xs">{(row.original.confidence * 100).toFixed(0)}%</span>
        </div>
      )
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => formatRelativeTime(row.original.created_at)
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(row.original);
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      )
    }
  ];
  return (
    <DataTable
      data={data}
      columns={columns}
      searchPlaceholder="搜索事实内容…"
      onRowClick={onSelect}
    />
  );
}
