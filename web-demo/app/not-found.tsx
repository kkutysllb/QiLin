import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="text-center">
        <div className="text-6xl font-bold text-qilin-500">404</div>
        <h1 className="mt-3 text-xl font-semibold">页面未找到</h1>
        <p className="mt-2 text-sm text-muted-foreground">你访问的页面不存在</p>
        <Button asChild className="mt-6">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            返回首页
          </Link>
        </Button>
      </div>
    </div>
  );
}
