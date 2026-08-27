"use client";
import { useEffect, useRef, useState } from "react";
import type { FC } from "react";

import type { FileViewerProps } from "@/core/sidebar/protocol";

const PdfViewer: FC<FileViewerProps> = ({ entry, content }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The plan's own test asserts visible text right after mount ("renders loading
  // placeholder initially"), so track the async load explicitly.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Vite-friendly worker URL — bundle worker via ?url import.
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
        const data = content instanceof Uint8Array ? content : new Uint8Array();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled || !canvasRef.current) return;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // pdfjs-dist@4 RenderParameters takes no `canvas` field (added in v5).
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [content, entry.name]);
  if (error) return <div className="p-2 text-xs text-rose-500">pdf error: {error}</div>;
  if (loading) return <div className="p-2 text-xs text-muted-foreground">loading pdf…</div>;
  return (
    <div className="flex h-full w-full justify-center overflow-auto bg-muted/30 p-2">
      <canvas ref={canvasRef} aria-label={entry.name} />
    </div>
  );
};

export { PdfViewer };
export default PdfViewer;
