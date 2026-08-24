'use client';
import type { McpServer } from '@/lib/api/mcp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plug, CheckCircle2, XCircle, Loader2, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

const STATUS_VARIANT = {
  connected: 'success',
  disconnected: 'secondary',
  error: 'destructive'
} as const;

const STATUS_ICON = {
  connected: <CheckCircle2 className="h-3.5 w-3.5 text-qilin-400" />,
  disconnected: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  error: <XCircle className="h-3.5 w-3.5 text-destructive" />
};

interface Props {
  server: McpServer;
  onSelect?: (s: McpServer) => void;
  onToggle?: (s: McpServer, enabled: boolean) => void;
  onRefresh?: (s: McpServer) => void;
  onRemove?: (s: McpServer) => void;
}

export function McpServerCard({ server, onSelect, onToggle, onRefresh, onRemove }: Props) {
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
          <Badge variant={STATUS_VARIANT[server.status]}>{server.status}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {STATUS_ICON[server.status]}
            {server.tools_count} 工具
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
          <Button variant="ghost" size="sm" onClick={() => onRefresh?.(server)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onRemove?.(server)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
