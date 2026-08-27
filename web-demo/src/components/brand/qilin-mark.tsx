import { cn } from "@/lib/utils";

/**
 * 「麟」字方印 — 玄金麒麟 VI 的品牌印章。
 * 默认纯装饰(aria-hidden)；作为 logo 语义使用时传入 label 以暴露给读屏。
 */
export function QilinSeal({
  size = 24,
  variant = "solid",
  label,
  className,
}: {
  size?: number;
  variant?: "solid" | "outline";
  label?: string;
  className?: string;
}) {
  const solid = variant === "solid";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="3.5"
        fill={solid ? "var(--ql-cinnabar)" : "none"}
        stroke={solid ? "none" : "var(--ql-cinnabar-hi)"}
        strokeWidth={solid ? 0 : 1.5}
      />
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill={solid ? "#fff5eb" : "var(--ql-cinnabar-hi)"}
        fontFamily="'Noto Serif SC','Songti SC','STSong',serif"
      >
        麟
      </text>
    </svg>
  );
}

/**
 * 半圆叠瓦鳞纹 — 极淡的角落氛围纹理(opacity 内建 0.05)。
 * 同一页面多实例时各自传不同 patternId 避免 <pattern> id 冲突。
 */
export function ScalePattern({
  patternId = "qilin-scale",
  className,
}: {
  patternId?: string;
  className?: string;
}) {
  return (
    <svg aria-hidden="true" focusable="false" width="260" height="180" className={className}>
      <defs>
        <pattern id={patternId} width="24" height="16" patternUnits="userSpaceOnUse">
          <path
            d="M0 16a12 12 0 0 1 24 0M-12 8a12 12 0 0 1 24 0M12 8a12 12 0 0 1 24 0M0 0a12 12 0 0 1 24 0"
            fill="none"
            stroke="var(--ql-gold-500)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} opacity="0.05" />
    </svg>
  );
}

/** 中点菱形金色分隔线（◆ 两翼渐隐细线）。 */
export function GoldDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-3", className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-ql-gold-700" />
      <span className="size-1.5 rotate-45 bg-ql-gold-500" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-ql-gold-700" />
    </div>
  );
}
