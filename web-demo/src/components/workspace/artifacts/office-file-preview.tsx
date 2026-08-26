"use client";

import { AlertCircleIcon, LoaderIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type OfficeFormat = "xlsx" | "docx" | "pptx";

export function getOfficeFormat(filepath: string): OfficeFormat | null {
  const ext = filepath.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  return null;
}

export function isOfficeFile(filepath: string): boolean {
  return getOfficeFormat(filepath) !== null;
}

/* -------------------------------------------------------------------------- */

export function OfficeFilePreview({
  url,
  filepath,
}: {
  url: string | undefined;
  filepath: string;
}) {
  const format = getOfficeFormat(filepath);
  const [data, setData] = useState<ArrayBuffer>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setData(undefined);
    setError(undefined);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (!cancelled) setData(buf);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load office file");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  switch (format) {
    case "xlsx":
      return <XlsxRenderer data={data} />;
    case "docx":
      return <DocxRenderer data={data} />;
    case "pptx":
      return <PptxRenderer data={data} />;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Loading / Error                                                            */
/* -------------------------------------------------------------------------- */

function LoadingState() {
  return (
    <div className="flex size-full items-center justify-center">
      <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 p-8 text-center">
      <AlertCircleIcon className="size-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* XLSX (SheetJS)                                                             */
/* -------------------------------------------------------------------------- */

function XlsxRenderer({ data }: { data: ArrayBuffer }) {
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string>();
  const tableRef = useRef<HTMLDivElement>(null);
  // 保存 XLSX 模块和工作簿，用于切换 sheet 时重新生成 HTML
  const xlsxRef = useRef<{ wb: any; XLSX: any } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("xlsx")
      .then((XLSX: any) => {
        if (cancelled) return;
        try {
          const wb = XLSX.read(data, { type: "array" });
          xlsxRef.current = { wb, XLSX };
          if (!cancelled) {
            setSheetNames(wb.SheetNames as string[]);
            setActiveSheet(0);
          }
        } catch {
          if (!cancelled) setError("Failed to parse spreadsheet");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load spreadsheet library");
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // 当 sheet 列表或选中 sheet 变化时，生成 HTML 写入 tableRef
  useEffect(() => {
    if (!tableRef.current || !xlsxRef.current || sheetNames.length === 0) return;
    const { wb, XLSX } = xlsxRef.current;
    const sheetName = sheetNames[activeSheet];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (sheet) {
      const full = XLSX.utils.sheet_to_html(sheet, { editable: false }) as string;
      const match = full.match(/<table[\s\S]*?<\/table>/i);
      tableRef.current.innerHTML = match ? match[0] : full;
    } else {
      tableRef.current.innerHTML = "";
    }
  }, [sheetNames, activeSheet]);

  if (error) return <ErrorState message={error} />;
  if (sheetNames.length === 0) return <LoadingState />;

  return (
    <div className="flex h-full flex-col">
      {sheetNames.length > 1 && (
        <div className="flex shrink-0 gap-1 border-b bg-background p-1">
          {sheetNames.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium",
                i === activeSheet
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div
        ref={tableRef}
        className="xlsx-preview min-h-0 flex-1 overflow-auto"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DOCX (docx-preview)                                                        */
/* -------------------------------------------------------------------------- */

function DocxRenderer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    import("docx-preview")
      .then(({ renderAsync }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        return renderAsync(
          new Blob([data]),
          containerRef.current,
          undefined,
          {
            inWrapper: true,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: true,
            className: "docx-preview",
          },
        );
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to render document");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) return <ErrorState message={error} />;
  return (
    <div className="docx-preview-container flex-1 overflow-auto">
      {loading && <LoadingState />}
      <div ref={containerRef} className="docx-preview-wrapper" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PPTX (pptx-vanilla-viewer)                                                 */
/* -------------------------------------------------------------------------- */

type PptxViewerHandle = { destroy: () => void };

function PptxRenderer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PptxViewerHandle | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    import("pptx-vanilla-viewer")
      .then(({ createPptxViewer }) => {
        if (cancelled || !containerRef.current) return;
        viewerRef.current?.destroy();
        const viewer = createPptxViewer(containerRef.current, {
          source: data,
          onLoad: () => {
            if (!cancelled) setLoading(false);
          },
          onError: (msg: string) => {
            if (!cancelled) {
              setError(msg || "Failed to load presentation");
              setLoading(false);
            }
          },
        }) as PptxViewerHandle;
        viewerRef.current = viewer;
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load presentation library");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [data]);

  if (error) return <ErrorState message={error} />;
  return (
    <div className="size-full overflow-auto">
      {loading && <LoadingState />}
      <div ref={containerRef} className="size-full" />
    </div>
  );
}
