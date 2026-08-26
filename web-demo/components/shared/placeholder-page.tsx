import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Settings, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** 该子系统计划做什么(功能清单) */
  plannedFeatures: string[];
  /** 关联的 Config section(如果配置已在 Config 页面暴露) */
  configSections?: string[];
  /** 关联的其他页面 */
  relatedPages?: Array<{ href: string; label: string }>;
  /** gateway 尚未暴露的端点 */
  missingEndpoints?: string[];
}

/**
 * 统一"占位"页面 — 用于 gateway 尚未暴露 API 的子系统。
 * 诚实说明:展示计划功能 + 关联 Config section + 缺失端点,而不是假装有功能。
 */
export function PlaceholderPage({
  icon: Icon,
  title,
  description,
  plannedFeatures,
  configSections,
  relatedPages,
  missingEndpoints
}: PlaceholderPageProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>该子系统尚未在 gateway 暴露 API</AlertTitle>
        <AlertDescription>
          web-demo 已预留此页面;等 gateway 提供对应端点后即可启用完整交互。
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plannedFeatures.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">计划功能</CardTitle>
              <CardDescription className="text-xs">本子系统设计覆盖的能力</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {plannedFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-qilin-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">当前可用入口</CardTitle>
            <CardDescription className="text-xs">通过现有页面间接配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {configSections && configSections.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  相关 Config sections
                </p>
                <div className="flex flex-wrap gap-1">
                  {configSections.map((s) => (
                    <Link key={s} href={`/config`}>
                      <Badge variant="secondary" className="font-mono">
                        {s}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {relatedPages && relatedPages.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">相关页面</p>
                <div className="flex flex-wrap gap-1">
                  {relatedPages.map((p) => (
                    <Link key={p.href} href={p.href}>
                      <Badge variant="outline" className="hover:bg-muted">
                        {p.label}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {missingEndpoints && missingEndpoints.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  期待的端点(gateway 尚未提供)
                </p>
                <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                  {missingEndpoints.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Settings className="h-3 w-3" />
        <span>子系统配置在</span>
        <Link href="/config" className="text-qilin-400 underline-offset-4 hover:underline">
          Config
        </Link>
        <span>页面统一管理</span>
        <ExternalLink className="h-3 w-3" />
      </div>
    </div>
  );
}
