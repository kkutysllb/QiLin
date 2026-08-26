import { PlaceholderPage } from '@/components/shared/placeholder-page';
import { ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AuthzPage() {
  return (
    <PlaceholderPage
      icon={ShieldCheck}
      title="授权"
      description="角色管理 + 资源授权矩阵"
      plannedFeatures={[
        '用户 / 角色 / 权限 CRUD',
        '资源级授权矩阵(读/写/管理)',
        'API Key 管理与权限绑定',
        '审计日志查询'
      ]}
      configSections={['users', 'authz', 'permissions']}
      relatedPages={[{ href: '/config', label: 'Config' }]}
      missingEndpoints={[
        'GET  /api/authz/roles',
        'POST /api/authz/roles',
        'GET  /api/authz/permissions',
        'GET  /api/authz/audit-log'
      ]}
    />
  );
}
