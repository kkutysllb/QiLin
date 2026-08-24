'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyRound } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { mcpApi } from '@/lib/api';
import { toast } from 'sonner';
import type { McpServer } from '@/lib/api/mcp';

interface Props {
  server: McpServer | null;
  onClose: () => void;
}

export function McpServerDetailDrawer({ server, onClose }: Props) {
  const oauthMutation = useMutation({
    mutationFn: (serverName: string) =>
      // 跳转到 gateway OAuth 授权端点
      (async () => {
        const res = await fetch(`/api/mcp/servers/${encodeURIComponent(serverName)}/oauth/authorize`, {
          credentials: 'include'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })(),
    onSuccess: (data) => {
      // Gateway 返回 authorize_url,前端跳转
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
      } else {
        toast.error('OAuth 端点未返回 authorize_url');
      }
    },
    onError: (e) => toast.error(`OAuth 启动失败: ${(e as Error).message}`)
  });

  return (
    <Dialog open={!!server} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{server?.name}</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={server?.status === 'connected' ? 'success' : 'destructive'}>
              {server?.status}
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
                    <span className="text-muted-foreground">URL</span>
                    <span className="font-mono">{server.url}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">工具数</span>
                    <span>{server.tools_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">状态</span>
                    <span>{server.status}</span>
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
                    若该 MCP 服务器要求 OAuth 授权,点击下方按钮启动授权码流程。授权完成后会通过 Gateway
                    callback 路由返回 access token,并保存到服务器配置。
                  </p>
                  <Button
                    onClick={() => oauthMutation.mutate(server.name)}
                    disabled={oauthMutation.isPending}
                    variant="outline"
                    size="sm"
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    启动 OAuth 授权
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
