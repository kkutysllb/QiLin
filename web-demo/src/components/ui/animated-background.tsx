"use client";

import { FlickeringGrid } from "@/components/ui/flickering-grid";
import Galaxy from "@/components/ui/galaxy";
import { cn } from "@/lib/utils";

/**
 * 登录/注册页同款动态背景：
 * Galaxy WebGL 星空 + 闪烁网格 + 紫/青 orb 光晕。
 * 用作绝对定位的整页背景层（父容器需 relative）。
 */
export function AnimatedBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("absolute inset-0", className)}>
      {/* Galaxy WebGL starfield */}
      <div className="absolute inset-0 z-0 bg-black/50">
        <Galaxy
          mouseRepulsion={false}
          starSpeed={0.2}
          density={0.6}
          glowIntensity={0.35}
          twinkleIntensity={0.3}
          speed={0.5}
        />
      </div>
      {/* Animated tech grid overlay */}
      <FlickeringGrid
        className="absolute inset-0 z-10 opacity-20"
        squareSize={4}
        gridGap={4}
        color="#6366f1"
        maxOpacity={0.1}
        flickerChance={0.12}
      />
      {/* Orb glow effects */}
      <div className="absolute top-1/4 left-1/4 size-96 rounded-full bg-purple-500/20 blur-[120px]" />
      <div className="absolute right-1/4 bottom-1/4 size-96 rounded-full bg-cyan-500/20 blur-[120px]" />
    </div>
  );
}
