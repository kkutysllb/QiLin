"use client";

import { type ComponentPropsWithoutRef, useId } from "react";

import { cn } from "@/lib/utils";

export type QilinSealProps = ComponentPropsWithoutRef<"svg"> & {
  size?: number;
  variant?: "solid" | "outline";
  /** 传入时暴露 role=img + aria-label；留空(含空串)则为纯装饰元素 */
  label?: string;
};

/**
 * 「麒麟」双字方印 — 玄金麒麟 VI 的品牌印章。
 * 默认纯装饰(aria-hidden)；作为 logo 语义使用时传入 label 以暴露给读屏。
 */
export function QilinSeal({
  size = 24,
  variant = "solid",
  label,
  className,
}: QilinSealProps) {
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
        x="7.1"
        y="15.4"
        textAnchor="middle"
        fontSize="9.6"
        fontWeight="700"
        fill={solid ? "#fff5eb" : "var(--ql-cinnabar-hi)"}
        fontFamily="'Noto Serif SC','Songti SC','STSong',serif"
      >
        麒
      </text>
      <text
        x="16.9"
        y="15.4"
        textAnchor="middle"
        fontSize="9.6"
        fontWeight="700"
        fill={solid ? "#fff5eb" : "var(--ql-cinnabar-hi)"}
        fontFamily="'Noto Serif SC','Songti SC','STSong',serif"
      >
        麟
      </text>
    </svg>
  );
}

export type ScalePatternProps = ComponentPropsWithoutRef<"svg"> & {
  /**
   * 可选的显式 pattern id；默认由 useId 生成稳定唯一值，
   * 同页多实例不会发生 <pattern> id 冲突，也杜绝非法字符注入。
   */
  patternId?: string;
};

/**
 * 半圆叠瓦鳞纹 — 极淡的角落氛围纹理(opacity 内建 0.05)。
 */
export function ScalePattern({ patternId, className }: ScalePatternProps) {
  const autoId = useId();
  // React useId 形如 «r0»/:r0:，含非 SVG-id 安全字符，先规范化
  const safeId =
    patternId ?? `ql-scale-${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="260"
      height="180"
      className={className}
    >
      <defs>
        <pattern
          id={safeId}
          width="24"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 16a12 12 0 0 1 24 0M-12 8a12 12 0 0 1 24 0M12 8a12 12 0 0 1 24 0M0 0a12 12 0 0 1 24 0"
            fill="none"
            stroke="var(--ql-gold-500)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill={`url(#${safeId})`}
        opacity="0.05"
      />
    </svg>
  );
}

/** 中点菱形金色分隔线（◆ 两翼渐隐细线）。装饰性元素。 */
export function GoldDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center gap-3", className)}
    >
      <span className="to-ql-gold-700 h-px flex-1 bg-gradient-to-r from-transparent" />
      <span className="bg-ql-gold-500 size-1.5 rotate-45" />
      <span className="to-ql-gold-700 h-px flex-1 bg-gradient-to-l from-transparent" />
    </div>
  );
}
