"use client";

import { cn } from "@/lib/utils";

/**
 * NeuralWaveSpinner — a fast-rotating 8-ray indicator used for streaming
 * and idle-loading states.
 *
 * All eight rays share the same opacity so the group reads as a uniform
 * sunburst at any single frame. Rotation uses SVG-native SMIL
 * (<animateTransform>), which is immune to the CSS keyframes /
 * transform-origin pitfalls that apply to SVG-internal elements — the
 * spinner spins even if the Tailwind/CSS animation pipeline changes.
 */
export function NeuralWaveSpinner({
  className,
}: {
  className?: string;
}) {
  // 8 rays at 45° increments, uniform brightness.
  const rays = Array.from({ length: 8 }, (_, index) => index);
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("text-primary inline-block shrink-0", className)}
    >
      <g>
        {/* SVG-native rotation around the centre (12,12) — no CSS needed. */}
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.7s"
          repeatCount="indefinite"
        />
        {rays.map((index) => {
          const angle = index * 45;
          return (
            <rect
              key={angle}
              x="11.25"
              y="3"
              width="1.5"
              height="4.5"
              rx="0.75"
              fill="currentColor"
              transform={`rotate(${angle} 12 12)`}
            />
          );
        })}
      </g>
      {/* Centre dot, sits on top of the rotating group and doesn't spin. */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}