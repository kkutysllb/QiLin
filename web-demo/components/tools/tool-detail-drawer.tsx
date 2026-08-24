'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Tool } from '@/lib/types';

export function ToolDetailDrawer({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  return (
    <Dialog open={!!tool} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{tool?.name}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{tool?.source}</Badge>
            {tool?.mcp_server && <Badge variant="secondary">via {tool.mcp_server}</Badge>}
            {tool?.requires_sandbox && <Badge variant="warning">requires sandbox</Badge>}
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          {tool && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">描述</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{tool.description}</p>
                </CardContent>
              </Card>
              {tool.parameters && Object.keys(tool.parameters.properties ?? {}).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">参数</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {Object.entries(tool.parameters.properties).map(([k, v]) => {
                        const required = tool.parameters?.required?.includes(k);
                        return (
                          <div key={k} className="flex items-baseline gap-2 text-xs">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                              {k}
                              {required && <span className="text-destructive">*</span>}
                            </code>
                            <span className="text-muted-foreground">({v.type})</span>
                            {v.description && (
                              <span className="line-clamp-1 text-muted-foreground">— {v.description}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
              {tool.tags && tool.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">标签</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {tool.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
