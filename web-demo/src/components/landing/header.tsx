import Link from "next/link";

import { QilinSeal } from "@/components/brand/qilin-mark";
import { cn } from "@/lib/utils";

export type HeaderProps = {
  className?: string;
  homeURL?: string;
};

export async function Header({ className, homeURL }: HeaderProps) {
  return (
    <header
      className={cn(
        // [-webkit-app-region:drag] 让整个头部在桌面壳里承担窗口拖拽；
        // pl-[80px] 为 macOS 红绿灯预留；Windows 无红灯经 .kworks-landing-header 收窄。
        // 平台兼容 class(kworks-*) 一律原样保留。
        "kworks-landing-header fixed top-0 right-0 left-0 z-20 mx-auto flex h-16 items-center justify-between px-6 md:px-10 pl-[80px] backdrop-blur-xs [-webkit-app-region:drag] md:pl-[calc(80px+1rem)]",
        className,
      )}
    >
      <a
        href={homeURL ?? "/"}
        className="flex items-center gap-2 [-webkit-app-region:no-drag]"
      >
        <span className="font-serif text-xl text-ql-ink-hi">QiLin</span>
        <QilinSeal size={14} variant="outline" />
      </a>
      <Link
        href="/workspace"
        className="font-mono text-xs tracking-widest text-ql-ink-mid transition-colors hover:text-ql-gold-300 [-webkit-app-region:no-drag]"
      >
        进入控制台 →
      </Link>
      <hr className="from-border/0 via-border/70 to-border/0 absolute top-16 right-0 left-0 z-10 m-0 h-px w-full border-none bg-linear-to-r" />
    </header>
  );
}
