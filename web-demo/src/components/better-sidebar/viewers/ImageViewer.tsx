"use client";
import { useEffect, useMemo } from "react";
import type { FC } from "react";
import type { FileViewerProps } from "@/core/sidebar/protocol";

const ImageViewer: FC<FileViewerProps> = ({ entry, content }) => {
  const url = useMemo(() => {
    if (typeof content === "string") return null; // raw URL not used
    // Copy into an ArrayBuffer-backed view (TS 5.9: Uint8Array<ArrayBufferLike> is not a BlobPart).
    const blob = new Blob([new Uint8Array(content as Uint8Array)], { type: entry.mime ?? "application/octet-stream" });
    return URL.createObjectURL(blob);
  }, [content, entry.mime]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!url) return <div className="p-2 text-xs text-muted-foreground">unsupported image</div>;
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30 p-2">
      <img src={url} alt={entry.name} className="max-h-full max-w-full object-contain" />
    </div>
  );
};

export { ImageViewer };
export default ImageViewer;
