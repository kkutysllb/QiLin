import { PlaceholderPage } from '@/components/shared/placeholder-page';
import { Wand2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ReflectionPage() {
  return (
    <PlaceholderPage
      icon={Wand2}
      title="反射"
      description="变量解析测试器"
      plannedFeatures={[
        '变量 / 模板解析测试器',
        '输入变量实时预览',
        '上下文注入可视化',
        '解析历史记录'
      ]}
      configSections={['reflection', 'templates']}
      relatedPages={[{ href: '/config', label: 'Config' }, { href: '/chat', label: '对话' }]}
      missingEndpoints={[
        'GET  /api/reflection/variables',
        'POST /api/reflection/resolve',
        'GET  /api/reflection/templates'
      ]}
    />
  );
}
