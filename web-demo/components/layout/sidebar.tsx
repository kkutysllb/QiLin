'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, FUTURE_NAV_ITEMS } from './nav-config';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export function Sidebar() {
  const pathname = usePathname();
  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.disabled ? '#' : item.href}
        aria-disabled={item.disabled}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive && 'bg-accent text-accent-foreground font-medium',
          !isActive && !item.disabled && 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
          item.disabled && 'pointer-events-none opacity-40'
        )}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.title}</span>
        {item.badge && (
          <Badge variant={item.badge === 'P0' ? 'success' : 'outline'} className="text-[10px]">
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card/30 md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="h-7 w-7 rounded-md bg-qilin-500" />
        <div>
          <div className="text-sm font-semibold leading-tight">QiLin</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent Engine</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        <div className="space-y-1">{NAV_ITEMS.map(renderItem)}</div>
        <Separator className="my-3" />
        <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          即将推出
        </div>
        <div className="space-y-1">{FUTURE_NAV_ITEMS.map(renderItem)}</div>
      </nav>
      <div className="border-t p-3 text-[10px] text-muted-foreground">v2.0.0 · Phase 0 MVP</div>
    </aside>
  );
}
