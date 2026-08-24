'use client';
import type { McpServerEntry } from '@/lib/api/mcp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plug, CheckCircle2, XCircle, Eye, RefreshCw } from 'lucide-react';

const STATUS_VARIANT = {
  connected: 'success',
  disconnected: 'secondary',
  error: 'destructive',
  unknown: 'outline'
} as const;

const STATUS_ICON = {
  connected: <CheckCircle2 className="h-3.5 w-3.5 text-qilin-400" />,
  disconnected: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  unknown: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
};

interface Props {
  server: McpServerEntry;
  onSelect?: (s: McpServerEntry) => void;
  onToggle?: (s: McpServerEntry, enabled: boolean) => void;
}

export function McpServerCard({ server, onSelect, onToggle }: Props) {
  const status = server.status ?? 'unknown';
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4 text-purple-400" />
            {server.name}
          </CardTitle>
          <Switch
            checked={server.enabled}
            onCheckedChange={(c) => onToggle?.(server, c)}
            aria-label="启用"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {STATUS_ICON[status]}
            {server.tools_count ?? 0} 工具
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="truncate rounded bg-muted/30 p-2 text-xs text-muted-foreground" title={server.url}>
          {server.url}
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onSelect?.(server)}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            详情
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
