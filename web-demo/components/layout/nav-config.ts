import {
  Home,
  MessageSquare,
  ListTree,
  Activity,
  Sparkles,
  Wrench,
  Plug,
  Brain,
  Upload,
  Radio,
  Clock,
  Cpu,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Box,
  Activity as ActivityIcon,
  Database,
  Wand2,
  FileEdit,
  Globe,
  Network
} from 'lucide-react';
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
  { title: '技能市场', href: '/skills', icon: Sparkles, badge: 'P0' },
  { title: '工具', href: '/tools', icon: Wrench, badge: 'P1' },
  { title: 'MCP', href: '/mcp', icon: Plug, badge: 'P1' },
  { title: '记忆', href: '/memory', icon: Brain, badge: 'P1' },
  { title: '上传', href: '/uploads', icon: Upload, badge: 'P1' },
  { title: '渠道', href: '/channels', icon: Radio, badge: 'P2' },
  { title: '调度', href: '/scheduler', icon: Clock, badge: 'P2' },
  { title: '模型', href: '/models', icon: Cpu, badge: 'P2' },
  { title: '配置', href: '/config', icon: Settings, badge: 'P2' },
  { title: '授权', href: '/authz', icon: ShieldCheck, badge: 'P3' },
  { title: '护栏', href: '/guardrails', icon: ShieldAlert, badge: 'P3' },
  { title: '沙箱', href: '/sandbox', icon: Box, badge: 'P3' },
  { title: '追踪', href: '/tracing', icon: ActivityIcon, badge: 'P3' },
  { title: '持久化', href: '/persistence', icon: Database, badge: 'P3' },
  { title: '反射', href: '/reflection', icon: Wand2, badge: 'P3' },
  { title: '工作区变更', href: '/workspace-changes', icon: FileEdit, badge: 'P3' },
  { title: '社区', href: '/community', icon: Globe, badge: 'P3' },
  { title: '集成', href: '/integrations', icon: Network, badge: 'P3' }
];

export const FUTURE_NAV_ITEMS: NavItem[] = [];
