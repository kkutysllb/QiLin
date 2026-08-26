"use client";

/**
 * KWorks 官方品牌 Logo（内联 favicon.svg / desktop build/icon-source.svg 设计）。
 * 深色圆角底 + 金色 K-Book（书脊 + 上下翻页）+ 三个金色圆点。
 * 内联 SVG 不受 static-export / Electron app:// scheme 影响，任意尺寸缩放。
 */
export function KWorksLogo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="KWorks logo"
      className={className}
    >
      <defs>
        <linearGradient id="kworks-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1A1A1A" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
        <linearGradient
          id="kworks-gold"
          x1="115"
          y1="140"
          x2="402"
          y2="396"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="22%" stopColor="#FCD34D" />
          <stop offset="48%" stopColor="#FBBF24" />
          <stop offset="74%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <filter id="kworks-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="9"
            floodColor="#FBBF24"
            floodOpacity="0.14"
          />
        </filter>
        <filter id="kworks-dotglow" x="-150%" y="-150%" width="400%" height="400%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="4"
            floodColor="#FCD34D"
            floodOpacity="0.28"
          />
        </filter>
        <filter id="kworks-bgblur">
          <feGaussianBlur stdDeviation="78" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="512" height="512" rx="90" ry="90" fill="url(#kworks-bg)" />
      <circle
        cx="258"
        cy="278"
        r="175"
        fill="#FBBF24"
        opacity="0.035"
        filter="url(#kworks-bgblur)"
      />

      {/* K-Book: plump rounded strokes */}
      <g filter="url(#kworks-glow)" stroke="url(#kworks-gold)" strokeLinecap="round" fill="none">
        {/* Spine (book spine = vertical bar of K) */}
        <line x1="156" y1="188" x2="156" y2="352" strokeWidth="84" />
        {/* Upper arm (upper page curving up-right) */}
        <path d="M 192 274 Q 286 220, 372 162" strokeWidth="66" />
        {/* Lower arm (lower page curving down-right) */}
        <path d="M 192 266 Q 286 320, 372 378" strokeWidth="66" />
      </g>

      {/* Subtle top highlight on spine */}
      <path
        d="M 140 168 Q 156 158, 172 168"
        stroke="#FEF3C7"
        strokeOpacity="0.3"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* Three scattered dots: knowledge & connection */}
      <g filter="url(#kworks-dotglow)">
        <circle cx="212" cy="112" r="16" fill="#FDE68A" />
        <circle cx="264" cy="88" r="12" fill="#FCD34D" />
        <circle cx="310" cy="114" r="9" fill="#FBBF24" />
      </g>
    </svg>
  );
}
