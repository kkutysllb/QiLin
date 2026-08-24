'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2 } from 'lucide-react';
import { memoryApi } from '@/lib/api';
import type { MemoryFact } from '@/lib/api/memory';

export function MemorySearchPanel() {
  const [query, setQuery] = useState('');
  const searchMutation = useMutation({
    mutationFn: (q: string) => memoryApi.search(q)
  });

  const results: MemoryFact[] = searchMutation.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">检索测试</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="输入查询,例如:用户的偏好 / 项目名 / 关键概念"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) searchMutation.mutate(query);
            }}
            data-testid="memory-search-input"
          />
          <Button
            onClick={() => query.trim() && searchMutation.mutate(query)}
            disabled={!query.trim() || searchMutation.isPending}
          >
            {searchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            检索
          </Button>
        </div>

        {searchMutation.isSuccess && (
          <div className="space-y-2" data-testid="memory-search-results">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>找到 {results.length} 条结果</span>
              {searchMutation.isError && <span className="text-destructive">检索失败</span>}
            </div>
            {results.length === 0 ? (
              <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                没有匹配的事实。试试别的关键词,或先在下方创建事实。
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border bg-muted/30 p-3 hover:bg-muted/50"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">
                        {r.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {(r.confidence * 100).toFixed(0)}% 置信度
                      </span>
                    </div>
                    <p className="text-sm">{r.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
