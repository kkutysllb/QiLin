"use client";

import {
  LoaderIcon,
  MaximizeIcon,
  RotateCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "ico",
  "apng",
]);

export function isImageFile(filepath: string): boolean {
  const ext = filepath.split(".").pop()?.toLowerCase();
  return ext != null && IMAGE_EXTENSIONS.has(ext);
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

/**
 * ImageFilePreview — dedicated image viewer with zoom / rotate / drag-pan,
 * replacing the bare-browser fallback so screenshots and generated images
 * are actually inspectable inside the artifact panel.
 */
export function ImageFilePreview({ url }: { url: string }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Non-passive wheel listener so Ctrl/⌘ + wheel can zoom without the page
  // (or the artifact panel) scrolling instead.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setScale((current) => {
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        return Math.min(Math.max(current * factor, MIN_SCALE), MAX_SCALE);
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setScale((current) =>
      Math.min(Math.max(current * factor, MIN_SCALE), MAX_SCALE),
    );
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  return (
    <div className="relative flex size-full flex-col">
      {status === "ready" && (
        <div className="bg-background/80 absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur">
          <span className="text-muted-foreground mx-1 font-mono text-[11px]">
            {Math.round(scale * 100)}%
          </span>
          <Button
            aria-label="缩小"
            size="icon-sm"
            variant="ghost"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <ZoomOutIcon className="size-3.5" />
          </Button>
          <Button
            aria-label="放大"
            size="icon-sm"
            variant="ghost"
            onClick={() => zoomBy(1.25)}
          >
            <ZoomInIcon className="size-3.5" />
          </Button>
          <Button
            aria-label="旋转"
            size="icon-sm"
            variant="ghost"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <RotateCwIcon className="size-3.5" />
          </Button>
          <Button aria-label="重置" size="icon-sm" variant="ghost" onClick={reset}>
            <MaximizeIcon className="size-3.5" />
          </Button>
        </div>
      )}
      <div
        ref={viewportRef}
        className={cn(
          "bg-muted/30 relative flex size-full items-center justify-center overflow-hidden",
          status === "ready" && "cursor-grab active:cursor-grabbing",
        )}
        onDoubleClick={reset}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {status === "loading" && (
          <LoaderIcon className="text-muted-foreground size-6 animate-spin" />
        )}
        {status === "error" && (
          <p className="text-muted-foreground text-sm">图片加载失败</p>
        )}
        <img
          alt="artifact preview"
          className={cn(
            "max-h-full max-w-full select-none transition-opacity",
            status === "ready" ? "opacity-100" : "opacity-0",
          )}
          draggable={false}
          src={url}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          onLoad={(event) => {
            setNaturalSize({
              w: event.currentTarget.naturalWidth,
              h: event.currentTarget.naturalHeight,
            });
            setStatus("ready");
          }}
          onError={() => setStatus("error")}
        />
        {status === "ready" && naturalSize.w > 0 && (
          <span className="text-muted-foreground/60 pointer-events-none absolute bottom-2 left-2 rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">
            {naturalSize.w} × {naturalSize.h}
          </span>
        )}
      </div>
    </div>
  );
}
