"use client";

import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  label: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 竖向拖拽分隔条，支持鼠标/触摸拖拽和键盘左右微调。
 * 拖拽期间给 body 加 `resizing` class 禁用文本选择和指针事件。
 */
export function ResizeHandle({
  width,
  minWidth,
  maxWidth,
  onResize,
  label,
}: ResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopDragging = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    document.body.classList.remove("select-none");
    document.body.classList.remove("cursor-col-resize");
  }, []);

  useEffect(() => stopDragging, [stopDragging]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopDragging();
    const startX = event.clientX;
    const startWidth = width;
    const handleMove = (moveEvent: PointerEvent) => {
      onResize(clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth));
    };
    const handleUp = () => stopDragging();
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    document.body.classList.add("select-none");
    document.body.classList.add("cursor-col-resize");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 12 : -12;
    onResize(clamp(width + delta, minWidth, maxWidth));
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative z-20 w-px shrink-0 cursor-col-resize bg-border transition-colors",
        "hover:w-1.5 hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none",
      )}
    />
  );
}
