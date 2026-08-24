import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** 自定义 children(用于嵌入 CTA 按钮组等) */
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted-foreground/60" />}
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
