import { PlaceholderPage } from '@/components/shared/placeholder-page';
import { ShieldAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function GuardrailsPage() {
  return (
    <PlaceholderPage
      icon={ShieldAlert}
      title="护栏"
      description="规则配置 + 拦截日志"
      plannedFeatures={[
        '输入 / 输出安全规则配置',
        '敏感内容过滤(正则 / 关键词 / 模型)',
        '拦截事件日志与统计',
        '规则命中测试器'
      ]}
      configSections={['guardrails', 'safety', 'moderation']}
      relatedPages={[{ href: '/config', label: 'Config' }]}
      missingEndpoints={[
        'GET  /api/guardrails/rules',
        'POST /api/guardrails/rules',
        'GET  /api/guardrails/events',
        'POST /api/guardrails/test'
      ]}
    />
  );
}
