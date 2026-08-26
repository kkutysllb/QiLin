"use client";

import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  Loader2Icon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAuthenticatedArtifactObjectUrl } from "@/core/artifacts/authenticated-url";
import { resolveArtifactURL, uploadArtifactPath } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import type { FileInMessage } from "@/core/messages/utils";
import { cn } from "@/lib/utils";

const FILE_TYPE_MAP: Record<string, string> = {
  json: "JSON",
  csv: "CSV",
  txt: "TXT",
  md: "Markdown",
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  rtf: "RTF",
  odt: "ODT",
  xls: "XLS",
  xlsx: "XLSX",
  ods: "ODS",
  ppt: "PPT",
  pptx: "PPTX",
  py: "Python",
  ipynb: "Notebook",
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  java: "Java",
  c: "C",
  cpp: "C++",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  sh: "Shell",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  log: "LOG",
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPEG",
  gif: "GIF",
  webp: "WEBP",
  svg: "SVG",
  mp3: "MP3",
  wav: "WAV",
  m4a: "M4A",
  flac: "FLAC",
  mp4: "MP4",
  mov: "MOV",
  avi: "AVI",
  mkv: "MKV",
  webm: "WEBM",
  zip: "ZIP",
  tar: "TAR",
  gz: "GZ",
  "7z": "7Z",
  rar: "RAR",
};

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

function getFileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getFileTypeLabel(filename: string): string {
  const ext = getFileExt(filename);
  return FILE_TYPE_MAP[ext] ?? (ext.toUpperCase() || "FILE");
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(getFileExt(filename));
}

/** Per-extension icon + color so non-image attachments read at a glance (PDF red, sheets green, code cyan, ...). */
const FILE_ICON_CONFIG: Record<string, { Icon: LucideIcon; iconClass: string }> = {
  pdf: { Icon: FileTextIcon, iconClass: "text-red-500" },
  doc: { Icon: FileTextIcon, iconClass: "text-blue-500" },
  docx: { Icon: FileTextIcon, iconClass: "text-blue-500" },
  rtf: { Icon: FileTextIcon, iconClass: "text-blue-500" },
  odt: { Icon: FileTextIcon, iconClass: "text-blue-500" },
  txt: { Icon: FileTextIcon, iconClass: "text-sky-500" },
  md: { Icon: FileTextIcon, iconClass: "text-sky-500" },
  log: { Icon: FileTextIcon, iconClass: "text-sky-500" },
  csv: { Icon: FileSpreadsheetIcon, iconClass: "text-emerald-500" },
  xls: { Icon: FileSpreadsheetIcon, iconClass: "text-emerald-500" },
  xlsx: { Icon: FileSpreadsheetIcon, iconClass: "text-emerald-500" },
  ods: { Icon: FileSpreadsheetIcon, iconClass: "text-emerald-500" },
  ppt: { Icon: FileTextIcon, iconClass: "text-orange-500" },
  pptx: { Icon: FileTextIcon, iconClass: "text-orange-500" },
  json: { Icon: FileJsonIcon, iconClass: "text-amber-500" },
  zip: { Icon: FileArchiveIcon, iconClass: "text-amber-500" },
  tar: { Icon: FileArchiveIcon, iconClass: "text-amber-500" },
  gz: { Icon: FileArchiveIcon, iconClass: "text-amber-500" },
  "7z": { Icon: FileArchiveIcon, iconClass: "text-amber-500" },
  rar: { Icon: FileArchiveIcon, iconClass: "text-amber-500" },
  mp3: { Icon: FileAudioIcon, iconClass: "text-pink-500" },
  wav: { Icon: FileAudioIcon, iconClass: "text-pink-500" },
  m4a: { Icon: FileAudioIcon, iconClass: "text-pink-500" },
  flac: { Icon: FileAudioIcon, iconClass: "text-pink-500" },
  mp4: { Icon: FileVideoIcon, iconClass: "text-fuchsia-500" },
  mov: { Icon: FileVideoIcon, iconClass: "text-fuchsia-500" },
  avi: { Icon: FileVideoIcon, iconClass: "text-fuchsia-500" },
  mkv: { Icon: FileVideoIcon, iconClass: "text-fuchsia-500" },
  webm: { Icon: FileVideoIcon, iconClass: "text-fuchsia-500" },
  py: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  ipynb: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  js: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  ts: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  tsx: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  jsx: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  java: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  c: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  cpp: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  go: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  rs: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  rb: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  php: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  sh: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  sql: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  html: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  css: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  xml: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  yaml: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
  yml: { Icon: FileCodeIcon, iconClass: "text-cyan-500" },
};

const DEFAULT_FILE_ICON = { Icon: FileIcon, iconClass: "text-violet-500" };

export function getFileTypeIcon(filename: string): {
  Icon: LucideIcon;
  iconClass: string;
} {
  return FILE_ICON_CONFIG[getFileExt(filename)] ?? DEFAULT_FILE_ICON;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * FilesCard — file chips/cards attached to or produced by a message.
 */
export function FilesCard({
  files,
  threadId,
  className,
}: {
  files: FileInMessage[];
  threadId: string;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file, index) => (
        <FileCard
          key={`${file.filename}-${index}`}
          file={file}
          threadId={threadId}
        />
      ))}
    </div>
  );
}

function FileCard({
  file,
  threadId,
}: {
  file: FileInMessage;
  threadId: string;
}) {
  const { t } = useI18n();
  const isUploading = file.status === "uploading";
  const isImage =
    isImageFile(file.filename) || (file.mediaType ?? "").startsWith("image/");
  const { Icon: TypeIcon, iconClass } = getFileTypeIcon(file.filename);
  // file.path must reach the API as a sandbox virtual path; uploadArtifactPath
  // normalizes host-absolute paths persisted by older submissions so the
  // authenticated blob fetch (and with it the whole image chip) doesn't fail.
  const fileUrl = file.path
    ? resolveArtifactURL(uploadArtifactPath(file.path, file.filename), threadId)
    : null;
  const displayFileUrl = useAuthenticatedArtifactObjectUrl(fileUrl);

  if (isUploading) {
    // Image uploads preview instantly from the local URL while the request
    // is in flight; a spinner overlay marks the pending upload state.
    if (isImage && file.localUrl) {
      return (
        <div className="border-border/40 group relative block overflow-hidden rounded-lg border opacity-80">
          <img
            src={file.localUrl}
            alt={file.filename}
            className="h-32 w-auto max-w-60 object-cover"
          />
          <span className="bg-background/70 absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            {t.uploads.uploading}
          </span>
        </div>
      );
    }
    return (
      <div className="bg-background border-border/40 flex max-w-50 min-w-30 flex-col gap-1 rounded-lg border p-3 opacity-60">
        <div className="flex items-start gap-2">
          <TypeIcon className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
          <span className="text-foreground truncate text-sm font-medium" title={file.filename}>
            {file.filename}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="rounded px-1.5 py-0.5 text-[10px] font-normal">
            {getFileTypeLabel(file.filename)}
          </Badge>
          <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
            <Loader2Icon className="size-3 animate-spin" />
            {t.uploads.uploading}
          </span>
        </div>
      </div>
    );
  }

  if (!file.path && !file.localUrl) return null;

  if (isImage) {
    // The authenticated blob URL resolves async; the local preview URL keeps
    // the thumbnail on screen in the meantime (and after history replay for
    // messages whose artifact fetch has not landed yet).
    const src = displayFileUrl ?? file.localUrl;
    if (!src) return null;
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="group border-border/40 relative block overflow-hidden rounded-lg border"
      >
        <img
          src={src}
          alt={file.filename}
          className="h-32 w-auto max-w-60 object-cover transition-transform group-hover:scale-105"
        />
      </a>
    );
  }

  return (
    <div className="flex max-w-52 min-w-32 flex-col gap-1 overflow-hidden rounded-xl border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/25 hover:border-border/70">
      <div className="flex items-start gap-2">
        <TypeIcon className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
        <span className="truncate text-sm font-medium text-foreground" title={file.filename}>
          {file.filename}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="rounded px-1.5 py-0.5 text-[10px] font-normal">
          {getFileTypeLabel(file.filename)}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
      </div>
    </div>
  );
}
