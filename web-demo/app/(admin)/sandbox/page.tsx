import { PlaceholderPage } from '@/components/shared/placeholder-page';
import { Box } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SandboxPage() {
  return (
    <PlaceholderPage
      icon={Box}
      title="沙箱"
      description="执行后端切换 + 环境变量"
      plannedFeatures={[
        '沙箱 provider 切换(local / docker / remote)',
        '环境变量与 secret 管理',
        '资源限额配置(CPU / 内存 / 磁盘 / 网络)',
        '沙箱运行日志'
      ]}
      configSections={['sandbox']}
      relatedPages={[{ href: '/config', label: 'Config' }]}
      missingEndpoints={[
        'GET  /api/sandbox/providers',
        'PUT  /api/sandbox/active',
        'GET  /api/sandbox/env-keys',
        'POST /api/sandbox/test'
      ]}
    />
  );
}
