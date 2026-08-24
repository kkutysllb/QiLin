import { ThemeToggle } from './theme-toggle';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@/lib/gateway/config';

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">{APP_NAME}</h1>
        <Badge variant="success" className="text-[10px]">
          dev
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground md:inline">Gateway: localhost:8080</span>
        <ThemeToggle />
      </div>
    </header>
  );
}
