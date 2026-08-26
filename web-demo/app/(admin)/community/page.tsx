import { PlaceholderPage } from '@/components/shared/placeholder-page';
import { Globe } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function CommunityPage() {
  return (
    <PlaceholderPage
      icon={Globe}
      title="社区"
      description="技能市场浏览 + 导入"
      plannedFeatures={[
        '社区技能市场浏览(评分 / 下载量)',
        '一键安装社区技能',
        '技能发布与版本管理',
        '社区贡献者榜单'
      ]}
      configSections={['community', 'skills']}
      relatedPages={[{ href: '/skills', label: '技能市场' }]}
      missingEndpoints={[
        'GET  /api/community/skills',
        'POST /api/community/import',
        'GET  /api/community/leaderboard'
      ]}
    />
  );
}
