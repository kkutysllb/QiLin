'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plug, Loader2, AlertCircle } from 'lucide-react';
import { mcpApi } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function McpAddDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      // 真实接口只有 PATCH 单服务器,没有"添加"接口。
      // 这里走 PUT 整个 config — 需先 GET 现有 config,再追加新服务器,再 PUT 回去。
      const current = await mcpApi.getConfig();
      const newServer = {
        name,
        url,
        enabled: true,
        auth: token ? { bearer: token } : undefined,
        status: 'unknown' as const
      };
      await mcpApi.updateConfig({
        ...current,
        servers: [...current.servers, newServer]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-config'] });
      toast.success('MCP 服务器已添加');
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(`添加失败: ${(e as Error).message}`)
  });

  const reset = () => {
    setName('');
    setUrl('');
    setToken('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 MCP 服务器</DialogTitle>
          <DialogDescription>
            通过 PUT /api/mcp/config 追加新服务器
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-amber-100/80">
                Gateway v2.0.0 的 MCP 配置通过整体 PUT 提交,需要 GET 现有 config 后追加。
                OAuth 流程需要 Gateway 端有专门的 <code>/api/v1/auth/oauth/&#123;provider&#125;</code> 端点支持(见 spec)。
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-name">名称</Label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-mcp-server"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              required
              type="url"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-token">Bearer Token(可选)</Label>
            <Input
              id="mcp-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-...  (留空则匿名)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              取消
            </Button>
            <Button onClick={() => addMutation.mutate()} disabled={!name || !url || addMutation.isPending}>
              {addMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              添加
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
