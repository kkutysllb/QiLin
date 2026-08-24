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
import { Plug, Loader2 } from 'lucide-react';
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
    mutationFn: () =>
      mcpApi.add({
        name,
        url,
        auth: token ? { bearer: token } : undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
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
            输入 MCP 服务器 URL。可选 Bearer Token 用于私有服务器。
            <br />
            支持 OAuth 授权流程的服务器需走 Gateway OAuth 路由(暂未启用)。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
