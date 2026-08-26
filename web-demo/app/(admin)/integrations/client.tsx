'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { integrationsApi } from '@/lib/api';
import type { LarkIntegrationStatus } from '@/lib/types/integration';
import { Network, Download, ShieldCheck, Terminal, ExternalLink, RefreshCw } from 'lucide-react';

interface Props {
  initialStatus: LarkIntegrationStatus | null;
}

export function IntegrationsClient({ initialStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [oauth, setOauth] = useState<{
    verification_url?: string;
    device_code?: string;
    expires_in?: number;
    waiting?: boolean;
  } | null>(null);

  if (!initialStatus) {
    return (
      <Alert variant="destructive">
        <AlertTitle>无法加载集成状态</AlertTitle>
        <AlertDescription>请检查 gateway 连接</AlertDescription>
      </Alert>
    );
  }

  const s = initialStatus;

  const handleInstall = async () => {
    setBusy('install');
    try {
      const r = await integrationsApi.install();
      toast.success(r.message ?? 'Lark 安装完成');
      router.refresh();
    } catch (e) {
      toast.error(`安装失败: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleAuthStart = async () => {
    setBusy('auth');
    try {
      const r = await integrationsApi.authStart({ recommend: true });
      setOauth({
        verification_url: r.verification_url,
        device_code: r.device_code,
        expires_in: r.expires_in,
        waiting: true
      });
      window.open(r.verification_url, '_blank', 'noopener,noreferrer');
      toast.success('已打开授权页面,请在浏览器中完成授权');
    } catch (e) {
      toast.error(`启动授权失败: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleAuthComplete = async () => {
    if (!oauth?.device_code) return;
    setBusy('complete');
    try {
      const r = await integrationsApi.authComplete({
        device_code: oauth.device_code,
        wait_timeout_seconds: 30
      });
      if (r.success) {
        toast.success('授权完成');
        setOauth(null);
        router.refresh();
      } else {
        toast.error(r.message ?? '授权未完成');
      }
    } catch (e) {
      toast.error(`完成授权失败: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Lark 卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10">
                <Network className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle>Lark / 飞书</CardTitle>
                <CardDescription>
                  {s.installed ? `v${s.version}` : '未安装'}
                  {s.latest_available_version &&
                    s.version !== s.latest_available_version && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (latest: {s.latest_available_version})
                      </span>
                    )}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={s.installed ? 'success' : 'outline'}>
                {s.installed ? 'installed' : 'not installed'}
              </Badge>
              <Badge variant={s.app_configured ? 'success' : 'outline'}>
                {s.app_configured ? 'configured' : 'not configured'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Stat label="App ID" value={s.app_id ?? '—'} mono />
            <Stat label="Skills" value={`${s.skills_installed ?? 0} / ${s.skills_expected ?? 0}`} />
            <Stat label="App Brand" value={s.app_brand ?? '—'} />
            <Stat label="Runtime OK" value={s.runtime_version_mismatch ? 'Mismatch' : 'OK'} />
          </div>

          {s.cli && (
            <Alert>
              <Terminal className="h-4 w-4" />
              <AlertTitle>lark-cli</AlertTitle>
              <AlertDescription className="font-mono text-xs">
                {s.cli.available ? (
                  <>
                    <span className="text-qilin-400">●</span> {s.cli.path} ({s.cli.version})
                  </>
                ) : (
                  <>
                    <span className="text-destructive">●</span> 不可用 — {s.cli.error ?? '未安装'}
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {s.installed_skills && s.installed_skills.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">已安装 Skills</p>
              <div className="flex flex-wrap gap-1">
                {s.installed_skills.slice(0, 10).map((sk) => (
                  <Badge key={sk} variant="secondary" className="text-[10px]">
                    {sk}
                  </Badge>
                ))}
                {s.installed_skills.length > 10 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{s.installed_skills.length - 10}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {!s.installed && (
              <Button onClick={handleInstall} disabled={busy !== null}>
                <Download className="mr-2 h-4 w-4" />
                {busy === 'install' ? '安装中...' : '安装 Lark'}
              </Button>
            )}
            {s.installed && !s.app_configured && (
              <Button onClick={handleAuthStart} disabled={busy !== null}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {busy === 'auth' ? '启动中...' : '配置 App 凭证'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
              disabled={busy !== null}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新状态
            </Button>
          </div>

          {oauth && (
            <Alert>
              <ExternalLink className="h-4 w-4" />
              <AlertTitle>等待授权</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-sm">
                  请在打开的浏览器页面中完成授权,然后点击下方按钮继续。
                </p>
                {oauth.expires_in && (
                  <Progress value={50} className="h-1" />
                )}
                <Button size="sm" onClick={handleAuthComplete} disabled={busy !== null}>
                  {busy === 'complete' ? '检查中...' : '我已完成授权'}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">支持的端点</CardTitle>
          <CardDescription className="text-xs">完整功能列表见 Phase 3 spec</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 font-mono text-xs text-muted-foreground">
            <li>GET /api/integrations/lark/status</li>
            <li>POST /api/integrations/lark/install</li>
            <li>POST /api/integrations/lark/auth/start</li>
            <li>POST /api/integrations/lark/auth/complete</li>
            <li>POST /api/integrations/lark/config/start</li>
            <li>POST /api/integrations/lark/config/complete</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-medium ${mono ? 'font-mono text-sm' : 'text-base'}`}>{value}</p>
    </div>
  );
}