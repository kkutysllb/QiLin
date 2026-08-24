'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  EmptyState
} from '@/components/shared/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { channelsApi } from '@/lib/api';
import type {
  ChannelConnection,
  ChannelProviderInfo,
  ChannelServiceStatus
} from '@/lib/types/channel';
import { Plug, RotateCw, Trash2, Power, MessageCircle } from 'lucide-react';

const PROVIDER_LABELS: Record<string, string> = {
  dingtalk: '钉钉',
  discord: 'Discord',
  feishu: '飞书',
  github: 'GitHub',
  slack: 'Slack',
  telegram: 'Telegram',
  wechat: '微信',
  wecom: '企业微信'
};

interface Props {
  initialProviders: ChannelProviderInfo[];
  initialStatus: ChannelServiceStatus | null;
  initialConnections: ChannelConnection[];
}

export function ChannelsClient({ initialProviders, initialStatus, initialConnections }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  if (!initialProviders.length && !initialStatus) {
    return (
      <Alert variant="destructive">
        <AlertTitle>无法加载渠道</AlertTitle>
        <AlertDescription>请检查 gateway 连接或稍后重试</AlertDescription>
      </Alert>
    );
  }

  const serviceRunning = initialStatus?.service_running ?? false;

  const handleRestart = (name: string) => {
    setBusyProvider(name);
    startTransition(async () => {
      try {
        await channelsApi.restart(name);
        toast.success(`${PROVIDER_LABELS[name] ?? name} 已重启`);
        router.refresh();
      } catch (e) {
        toast.error(`重启失败: ${(e as Error).message}`);
      } finally {
        setBusyProvider(null);
      }
    });
  };

  const handleToggleRuntime = (provider: ChannelProviderInfo) => {
    setBusyProvider(provider.provider);
    startTransition(async () => {
      try {
        if (provider.enabled) {
          await channelsApi.resetRuntimeConfig(provider.provider);
          toast.success(`${PROVIDER_LABELS[provider.provider] ?? provider.provider} runtime 配置已重置`);
        } else {
          await channelsApi.setRuntimeConfig(provider.provider, {});
          toast.success(`${PROVIDER_LABELS[provider.provider] ?? provider.provider} runtime 配置已写入`);
        }
        router.refresh();
      } catch (e) {
        toast.error(`操作失败: ${(e as Error).message}`);
      } finally {
        setBusyProvider(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Service 总状态 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Channel Service</CardTitle>
          <Badge variant={serviceRunning ? 'success' : 'destructive'}>
            {serviceRunning ? 'Running' : 'Stopped'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {initialProviders.length}{' '}
            <span className="text-sm font-normal text-muted-foreground">providers</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {initialProviders.filter((p) => p.configured).length} 已配置 ·{' '}
            {initialProviders.filter((p) => p.enabled).length} 已启用
          </p>
        </CardContent>
      </Card>

      {/* Provider 网格 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Providers</h2>
        {initialProviders.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="无可用渠道"
            description="Gateway 报告 enabled=false — 请检查配置"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {initialProviders.map((p) => (
              <ProviderCard
                key={p.provider}
                provider={p}
                busy={busyProvider === p.provider}
                onRestart={() => handleRestart(p.provider)}
                onToggle={() => handleToggleRuntime(p)}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Connections 列表 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">活跃连接</h2>
          <span className="text-sm text-muted-foreground">
            共 {initialConnections.length} 条
          </span>
        </div>
        {initialConnections.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="尚未建立任何连接"
            description="完成 OAuth 授权后会出现在这里"
          />
        ) : (
          <div className="space-y-2">
            {initialConnections.map((c) => (
              <ConnectionRow key={c.id} connection={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  busy,
  onRestart,
  onToggle
}: {
  provider: ChannelProviderInfo;
  busy: boolean;
  onRestart: () => void;
  onToggle: () => void;
}) {
  const label = PROVIDER_LABELS[provider.provider] ?? provider.display_name ?? provider.provider;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription className="truncate text-xs">{provider.provider}</CardDescription>
          </div>
          <Badge variant={provider.configured ? 'success' : 'outline'}>
            {provider.configured ? 'configured' : 'unconfigured'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Auth Mode</span>
          <Badge variant="secondary" className="text-[10px]">
            {provider.auth_mode ?? '—'}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Status</span>
          <Badge
            variant={
              provider.connection_status === 'connected'
                ? 'success'
                : provider.connection_status === 'error'
                ? 'destructive'
                : 'outline'
            }
            className="text-[10px]"
          >
            {provider.connection_status ?? 'unknown'}
          </Badge>
        </div>
        {provider.unavailable_reason && (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {provider.unavailable_reason}
          </p>
        )}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={provider.enabled}
              onCheckedChange={onToggle}
              disabled={busy || !provider.configured}
            />
            <span className="text-xs text-muted-foreground">
              {provider.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRestart}
            disabled={busy || !provider.configured}
          >
            <RotateCw className={`mr-1 h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
            Restart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionRow({ connection }: { connection: ChannelConnection }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const label = PROVIDER_LABELS[connection.provider] ?? connection.provider;

  const handleDelete = () => {
    setBusy(true);
    startTransition(async () => {
      try {
        await channelsApi.deleteConnection(connection.id);
        toast.success(`已断开 ${label}`);
        router.refresh();
      } catch (e) {
        toast.error(`断开失败: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          <Badge
            variant={connection.status === 'connected' ? 'success' : 'outline'}
            className="text-[10px]"
          >
            {connection.status}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {connection.external_account_name ??
            connection.external_account_id ??
            connection.workspace_name ??
            connection.id}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {new Date(connection.created_at).toLocaleDateString()}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          disabled={busy}
          title="断开连接"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
