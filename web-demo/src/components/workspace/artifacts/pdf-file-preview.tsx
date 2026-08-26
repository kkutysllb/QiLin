"use client";

import { DownloadIcon, FileTextIcon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function isPdfFile(filepath: string): boolean {
  return filepath.split(".").pop()?.toLowerCase() === "pdf";
}

/**
 * PdfFilePreview — dedicated PDF viewer. Renders the authenticated blob
 * URL through the embedded PDF engine (`<object>` with an `<iframe>`
 * fallback), with explicit loading / error states and a download escape
 * hatch instead of silently showing a blank panel.
 */
export function PdfFilePreview({
  url,
  filepath,
}: {
  url: string;
  filepath: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    setStatus("loading");
  }, [url]);

  return (
    <div className="bg-muted/20 relative size-full">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <LoaderIcon className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}
      {status === "error" ? (
        <div className="flex size-full flex-col items-center justify-center gap-3">
          <FileTextIcon className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">
            无法内嵌渲染此 PDF
          </p>
          <a
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40"
            download={filepath.split("/").pop()}
            href={url}
          >
            <DownloadIcon className="size-4" />
            下载文件
          </a>
        </div>
      ) : (
        <object
          aria-label={`PDF 预览：${filepath}`}
          className="size-full"
          data={url}
          type="application/pdf"
          onError={() => setStatus("error")}
          onLoad={() => setStatus("ready")}
        >
          <iframe
            className="size-full"
            src={url}
            title={`PDF 预览：${filepath}`}
            onLoad={() => setStatus("ready")}
          />
        </object>
      )}
    </div>
  );
}
