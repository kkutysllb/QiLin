'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { configApi } from '@/lib/api';
import { AlertTriangle, RefreshCw, Save, RotateCcw } from 'lucide-react';

interface Props {
  initialConfig: Record<string, unknown>;
}

export function ConfigClient({ initialConfig }: Props) {
  const router = useRouter();
  const sections = useMemo(
    () => Object.keys(initialConfig).sort(),
    [initialConfig]
  );
  const [active, setActive] = useState<string>(sections[0] ?? '');
  const [draft, setDraft] = useState<string>(
    active ? serialize(initialConfig[active]) : ''
  );
  const [original, setOriginal] = useState<string>(draft);
  const [pending, startTransition] = useTransition();
  const [restarting, startRestart] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDirty = draft !== original;

  const switchSection = (name: string) => {
    if (isDirty && !confirm('当前 section 有未保存修改,确认切换?')) return;
    setActive(name);
    const next = serialize(initialConfig[name]);
    setDraft(next);
    setOriginal(next);
    setError(null);
  };

  const handleReset = () => {
    setDraft(original);
    setError(null);
  };

  const handleSave = () => {
    let parsed: unknown;
    try {
      parsed = parse(draft);
    } catch (e) {
      setError(`YAML 解析失败: ${(e as Error).message}`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await configApi.updateSection(active, { data: parsed as Record<string, unknown> });
        toast.success(`已保存 ${active} — 记得点 Restart 热重载`);
        setOriginal(draft);
        router.refresh();
      } catch (e) {
        toast.error(`保存失败: ${(e as Error).message}`);
      }
    });
  };

  const handleRestart = () => {
    if (
      !confirm(
        '重启 Gateway 会断开所有客户端连接(几秒内恢复),确认继续?'
      )
    )
      return;
    startRestart(async () => {
      try {
        const r = await configApi.restart();
        toast.success(r.message ?? 'Gateway 正在重启...');
      } catch (e) {
        toast.error(`重启失败: ${(e as Error).message}`);
      }
    });
  };

  if (sections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>配置为空</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-[240px_1fr] gap-4">
      {/* Left: Section tree */}
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sections</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[60vh]">
            <div className="space-y-0.5 p-2">
              {sections.map((s) => (
                <button
                  key={s}
                  onClick={() => switchSection(s)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active === s
                      ? 'bg-qilin-500/10 text-qilin-300'
                      : 'hover:bg-muted'
                  }`}
                >
                  <span className="truncate font-mono">{s}</span>
                  {isDirty && active === s && (
                    <Badge variant="warning" className="text-[10px]">
                      unsaved
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: YAML editor + actions */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="font-mono text-sm">{active}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                编辑后需 Restart 才生效
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                disabled={!isDirty || pending}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                重置
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!isDirty || pending}>
                <Save className="mr-1 h-3 w-3" />
                {pending ? '保存中...' : '保存'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <pre className="whitespace-pre-wrap font-mono">{error}</pre>
              </div>
            )}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60vh] font-mono text-xs"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <Card className="border-qilin-500/30 bg-qilin-500/5">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium">重启 Gateway</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                让所有 section 的修改生效。会短暂断开连接。
              </p>
            </div>
            <Button onClick={handleRestart} disabled={restarting}>
              <RefreshCw className={`mr-2 h-4 w-4 ${restarting ? 'animate-spin' : ''}`} />
              {restarting ? '重启中...' : 'Restart Gateway'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Serialize any JS value to YAML-like text using JSON (good enough for config editing) */
function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Parse draft. We accept JSON (gateway uses JSON for config sections, not real YAML).
 *  If gateway later switches to YAML, swap implementation here. */
function parse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  // 优先尝试 JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  // 退路:尝试 key: value 形式(简化 YAML)
  const obj: Record<string, unknown> = {};
  for (const line of trimmed.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w.-]*)\s*:\s*(.*)$/);
    if (m) {
      const k = m[1];
      const v = m[2];
      obj[k] = coerce(v);
    }
  }
  return obj;
}

function coerce(v: string): unknown {
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  const n = Number(v);
  if (!isNaN(n) && v !== '') return n;
  return v;
}
