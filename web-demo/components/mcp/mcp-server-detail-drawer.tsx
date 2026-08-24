'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import type { McpServerEntry } from '@/lib/api/mcp';

interface Props {
  server: McpServerEntry | null;
  onClose: () => void;
}

export function McpServerDetailDrawer({ server, onClose }: Props) {
  const startOAuth = () => {
    // Gateway v2.0.0 的 MCP OAuth 需要 /api/v1/auth/oauth/{provider} 端点
    // 这里直接打开 Gateway OAuth 入口(若已配置)
    window.location.href = `/api/v1/auth/oauth/mcp-${server?.name ?? 'default'}`;
  };

  return (
    <Dialog open={!!server} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{server?.name}</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={server?.status === 'connected' ? 'success' : 'destructive'}>
              {server?.status ?? 'unknown'}
            </Badge>
            <span className="truncate">{server?.url}</span>
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          {server && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">连接信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">名称</span>
                    <span className="font-mono">{server.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">URL</span>
                    <span className="truncate font-mono">{server.url}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">工具数</span>
                    <span>{server.tools_count ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">状态</span>
                    <span>{server.status ?? 'unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">启用</span>
                    <span>{server.enabled ? '是' : '否'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">授权</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    若该 MCP 服务器要求 OAuth 授权,点击下方按钮启动授权码流程。Gateway 端会跳转到 provider 的
                    authorize 端点,完成后通过 callback 路由返回 access token。
                  </p>
                  <button
                    onClick={startOAuth}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                  >
                    <KeyRound className="h-4 w-4" />
                    启动 OAuth 授权
                  </button>
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
