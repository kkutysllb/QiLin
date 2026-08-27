import { type ReactNode } from "react";

import { QilinSeal } from "@/components/brand/qilin-mark";
import { cn } from "@/lib/utils";

/** 认证页表单控件统一样式（Input 直接拼接到 className 使用）。 */
export const authFieldClass =
  "border-white/15 bg-transparent text-ql-ink-hi placeholder:text-ql-ink-low focus-visible:border-ql-gold-500 focus-visible:ring-ql-gold-500/40 transition-colors";

/** 认证页表单 label 统一样式。 */
export const authLabelClass = "font-mono text-xs tracking-widest text-ql-ink-mid";

/** 错误文案统一样式（暗底朱砂亮化变体）。 */
export const authErrorClass = "text-ql-cinnabar-hi";

/** 主操作按钮统一样式（金色实底黑字，替代彩虹渐变）。 */
export const authSubmitClass =
  "w-full rounded-lg border-0 bg-ql-gold-500 font-semibold text-[#141006] shadow-none transition-colors hover:bg-ql-gold-300 disabled:bg-ql-gold-700";

/**
 * 认证页公共外壳 — 玄金麒麟 VI：暖玄黑底 + 弱金顶光，
 * 窄体圆角卡片 + 顶部 2px 鎏金饰条。login / setup 共用，纯服务端组件。
 */
export function AuthShell({
  children,
  title,
  subtitle,
  className,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className="bg-ql-bg relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* 背景层（比 landing 更收敛：仅弱金顶光） */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(201,162,74,0.08),transparent_70%)]" />
      </div>
      {/* 卡片容器 */}
      <div className={cn("relative z-10 w-full max-w-sm px-4", className)}>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div
            aria-hidden="true"
            className="h-0.5 bg-gradient-to-r from-transparent via-ql-gold-500 to-transparent"
          />
          <div className="space-y-6 p-8">
            <div className="flex flex-col items-center gap-1 text-center">
              {/* 品牌与页面标题同一行(细竖线分隔)，整体居中；副标题独占一行 */}
              <div className="flex items-center justify-center gap-2">
                <QilinSeal size={18} />
                <span className="font-serif text-xl text-ql-ink-hi">QiLin</span>
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-4 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent"
                />
                <h1 className="text-base font-semibold text-ql-ink-hi">{title}</h1>
              </div>
              {subtitle && <p className="text-sm text-ql-ink-mid">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
