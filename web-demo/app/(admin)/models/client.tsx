'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { modelsApi } from '@/lib/api';
import type { ModelConfig, ModelCreateInput } from '@/lib/types/model';
import { Cpu, Plus, Trash2, Edit, Settings } from 'lucide-react';

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'google', 'azure', 'ollama', 'custom'] as const;

interface Props {
  initialModels: ModelConfig[];
}

export function ModelsClient({ initialModels }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  // 按 provider 分组
  const byProvider = initialModels.reduce<Record<string, ModelConfig[]>>((acc, m) => {
    const k = m.provider || 'unknown';
    (acc[k] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新增模型
            </Button>
          </DialogTrigger>
          <ModelFormDialog
            onClose={() => setCreateOpen(false)}
            onSuccess={() => {
              setCreateOpen(false);
              router.refresh();
            }}
          />
        </Dialog>
      </div>

      {initialModels.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="尚未配置任何模型"
          description="去 Config 添加 provider 凭证,然后在这里注册模型"
        >
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新增模型
              </Button>
            </DialogTrigger>
            <ModelFormDialog
              onClose={() => setCreateOpen(false)}
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
            />
          </Dialog>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {Object.entries(byProvider).map(([provider, models]) => (
            <div key={provider}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Badge variant="outline" className="font-mono">
                  {provider}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {models.length} 个模型
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {models.map((m) => (
                  <ModelCard key={m.name} model={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model }: { model: ModelConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const handleToggle = async () => {
    setBusy(true);
    try {
      await modelsApi.update(model.name, { enabled: !(model.enabled ?? true) });
      toast.success(`${model.name} 已${model.enabled ? '禁用' : '启用'}`);
      router.refresh();
    } catch (e) {
      toast.error(`失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认删除 ${model.name}?`)) return;
    setBusy(true);
    try {
      await modelsApi.delete(model.name);
      toast.success(`已删除 ${model.name}`);
      router.refresh();
    } catch (e) {
      toast.error(`删除失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{model.name}</CardTitle>
            <CardDescription className="truncate font-mono text-xs">
              {model.model_id}
            </CardDescription>
          </div>
          <Badge variant={model.enabled ? 'success' : 'outline'}>
            {model.enabled ? 'enabled' : 'disabled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {model.description && (
          <p className="text-xs text-muted-foreground">{model.description}</p>
        )}
        <div className="flex flex-wrap gap-1 text-xs">
          {model.max_tokens && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              max: {model.max_tokens}
            </Badge>
          )}
          {model.temperature !== undefined && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              temp: {model.temperature}
            </Badge>
          )}
          {model.api_key_env && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {model.api_key_env}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between pt-2">
          <Switch
            checked={model.enabled ?? true}
            onCheckedChange={handleToggle}
            disabled={busy}
          />
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              disabled={busy}
              title="编辑"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDelete}
              disabled={busy}
              title="删除"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <ModelFormDialog
          initial={model}
          onClose={() => setEditOpen(false)}
          onSuccess={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </Dialog>
    </Card>
  );
}

function ModelFormDialog({
  initial,
  onClose,
  onSuccess
}: {
  initial?: ModelConfig;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [provider, setProvider] = useState(initial?.provider ?? 'openai');
  const [modelId, setModelId] = useState(initial?.model_id ?? '');
  const [apiBase, setApiBase] = useState(initial?.api_base ?? '');
  const [apiKeyEnv, setApiKeyEnv] = useState(initial?.api_key_env ?? '');
  const [maxTokens, setMaxTokens] = useState(
    initial?.max_tokens?.toString() ?? '4096'
  );
  const [temperature, setTemperature] = useState(
    initial?.temperature?.toString() ?? '0.7'
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: ModelCreateInput = {
        name,
        provider,
        model_id: modelId,
        api_base: apiBase || undefined,
        api_key_env: apiKeyEnv || undefined,
        max_tokens: Number(maxTokens) || undefined,
        temperature: Number(temperature) || undefined,
        description: description || undefined,
        enabled: initial?.enabled ?? true
      };
      if (initial) {
        await modelsApi.update(initial.name, payload);
        toast.success(`已更新 ${name}`);
      } else {
        await modelsApi.create(payload);
        toast.success(`已创建 ${name}`);
      }
      onSuccess();
    } catch (e) {
      toast.error(`失败: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑模型' : '新增模型'}</DialogTitle>
          <DialogDescription>
            API Key 通过环境变量名引用({'{API_KEY_ENV}'}),不要直接填密钥
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="name">名称</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!!initial}
              placeholder="gpt-4o-mini"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWN_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model_id">Model ID</Label>
          <Input
            id="model_id"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            required
            className="font-mono"
            placeholder="gpt-4o-mini-2024-07-18"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="api_base">API Base (可选)</Label>
            <Input
              id="api_base"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api_key_env">API Key Env</Label>
            <Input
              id="api_key_env"
              value={apiKeyEnv}
              onChange={(e) => setApiKeyEnv(e.target.value)}
              placeholder="OPENAI_API_KEY"
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="max_tokens">Max Tokens</Label>
            <Input
              id="max_tokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">描述 (可选)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '提交中...' : initial ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
