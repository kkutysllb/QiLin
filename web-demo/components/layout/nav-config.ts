import { Home, MessageSquare, ListTree, Activity, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: 'P0' | 'P1' | 'P2' | 'P3';
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { title: '总览', href: '/', icon: Home },
  { title: '对话', href: '/chat', icon: MessageSquare, badge: 'P0' },
  { title: '线程', href: '/threads', icon: ListTree, badge: 'P0' },
  { title: '运行', href: '/runs', icon: Activity, badge: 'P0' },
  { title: '技能市场', href: '/skills', icon: Sparkles, badge: 'P0' }
];

export const FUTURE_NAV_ITEMS: NavItem[] = [
  { title: '工具', href: '/tools', icon: Sparkles, badge: 'P1', disabled: true },
  { title: 'MCP', href: '/mcp', icon: Sparkles, badge: 'P1', disabled: true },
  { title: '记忆', href: '/memory', icon: Sparkles, badge: 'P1', disabled: true },
  { title: '上传', href: '/uploads', icon: Sparkles, badge: 'P1', disabled: true },
  { title: '渠道', href: '/channels', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '调度', href: '/scheduler', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '模型', href: '/models', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '配置', href: '/config', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '授权', href: '/authz', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '护栏', href: '/guardrails', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '沙箱', href: '/sandbox', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '追踪', href: '/tracing', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '持久化', href: '/persistence', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '反射', href: '/reflection', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '工作区变更', href: '/workspace-changes', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '社区', href: '/community', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '集成', href: '/integrations', icon: Sparkles, badge: 'P3', disabled: true }
];
