'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import type { Skill } from '@/lib/types';

export function SkillDetailDrawer({
  skill,
  onClose
}: {
  skill: Skill | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!skill} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{skill?.name}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{skill?.source}</Badge>
            {skill?.installed_at && <span>{formatDateTime(skill.installed_at)}</span>}
            {skill?.version && <span>v{skill.version}</span>}
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          {skill && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">描述</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{skill.description}</p>
                </CardContent>
              </Card>
              {skill.author && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">作者</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{skill.author}</p>
                  </CardContent>
                </Card>
              )}
              {skill.tags && skill.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">标签</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {skill.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {skill.scan_result && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">扫描结果</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {skill.scan_result.findings.length === 0 ? (
                      <p className="text-xs text-muted-foreground">未发现问题</p>
                    ) : (
                      <ul className="space-y-2 text-xs">
                        {skill.scan_result.findings.map((f, i) => (
                          <li
                            key={i}
                            className={
                              f.severity === 'error'
                                ? 'text-destructive'
                                : f.severity === 'warning'
                                  ? 'text-amber-400'
                                  : 'text-muted-foreground'
                            }
                          >
                            [{f.severity}] {f.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
