"use client";

import { useId } from "react";

/**
 * QiLin 官方品牌 Logo（玄金麒麟 VI）——朱砂麒麟双字印徽标。
 * 与 brand/qilin-mark.tsx 的 QilinSeal 同族：朱砂圆角方章 +
 * 暖白「麒麟」双字，内圈鎏金细线收边、顶部微光提亮。
 * 内联 SVG 不受 static-export / Electron app:// scheme 影响，任意尺寸缩放。
 */
export function QiLinLogo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const uid = useId();
  // 多实例(侧边栏/设置页/其他)共存时避免 <linearGradient> id 冲突
  const bgId = `ql-logo-bg-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="QiLin logo"
      className={className}
    >
      <defs>
        {/* 朱砂底：顶部微亮的垂直渐变 */}
        <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4503d" />
          <stop offset="55%" stopColor="#c3402f" />
          <stop offset="100%" stopColor="#a23526" />
        </linearGradient>
      </defs>

      {/* 章底 */}
      <rect width="512" height="512" rx="110" ry="110" fill={`url(#${bgId})`} />
      {/* 顶部微光(暖白高光, 克制的一层) */}
      <ellipse
        cx="256"
        cy="-40"
        rx="300"
        ry="150"
        fill="#fff5eb"
        opacity="0.08"
      />
      {/* 内圈鎏金细线 */}
      <rect
        x="20"
        y="20"
        width="472"
        height="472"
        rx="92"
        ry="92"
        fill="none"
        stroke="#f3dc9e"
        strokeOpacity="0.5"
        strokeWidth="8"
      />

      {/* 「麒麟」双字主体（横排，字号随双字收窄） */}
      <text
        x="151"
        y="333"
        textAnchor="middle"
        fontFamily="'Noto Serif SC','Songti SC','STSong','SimSun',serif"
        fontSize="205"
        fontWeight="700"
        fill="#fff5eb"
      >
        麒
      </text>
      <text
        x="361"
        y="333"
        textAnchor="middle"
        fontFamily="'Noto Serif SC','Songti SC','STSong','SimSun',serif"
        fontSize="205"
        fontWeight="700"
        fill="#fff5eb"
      >
        麟
      </text>
    </svg>
  );
}
