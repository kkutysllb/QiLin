'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { truncate } from '@/lib/utils';
import type { Tool, ToolSource } from '@/lib/types';
import { Wrench, Brain, Plug, Sparkles, Bot } from 'lucide-react';

const SOURCE_ICON: Record<ToolSource, typeof Wrench> = {
  builtin: Wrench,
  mcp: Plug,
  skill: Sparkles,
  subagent: Bot,
  community: Brain
};

const SOURCE_VARIANT: Record<ToolSource, 'default' | 'secondary' | 'outline' | 'success' | 'warning'> = {
  builtin: 'default',
  mcp: 'secondary',
  skill: 'warning',
  subagent: 'success',
  community: 'outline'
};

interface Props {
  data: Tool[];
  onSelect?: (t: Tool) => void;
  onToggle?: (t: Tool, enabled: boolean) => void;
}

export function ToolsTable({ data, onSelect, onToggle }: Props) {
  const columns: ColumnDef<Tool, unknown>[] = [
    {
      accessorKey: 'name',
      header: '名称',
      cell: ({ row }) => {
        const Icon = SOURCE_ICON[row.original.source];
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-xs">{truncate(row.original.name, 24)}</span>
          </div>
        );
      }
    },
    {
      accessorKey: 'source',
      header: '来源',
      cell: ({ row }) => <Badge variant={SOURCE_VARIANT[row.original.source]}>{row.original.source}</Badge>
    },
    {
      accessorKey: 'description',
      header: '描述',
      cell: ({ row }) => (
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {truncate(row.original.description, 80)}
        </span>
      )
    },
    {
      accessorKey: 'requires_sandbox',
      header: '沙箱',
      cell: ({ row }) =>
        row.original.requires_sandbox ? <Badge variant="outline">required</Badge> : '—'
    },
    {
      id: 'actions',
      header: '启用',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={(c) => onToggle?.(row.original, c)}
          aria-label="启用"
        />
      )
    }
  ];
  return (
    <DataTable
      data={data}
      columns={columns}
      searchPlaceholder="搜索工具名称 / 描述…"
      onRowClick={onSelect}
    />
  );
}
