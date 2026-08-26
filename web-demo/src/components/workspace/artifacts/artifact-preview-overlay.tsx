"use client";

import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { downloadArtifactUrl } from "@/core/artifacts/authenticated-url";
import { urlOfArtifact } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import { getFileName } from "@/core/utils/files";
import { cn } from "@/lib/utils";

import { ArtifactFileDetail } from "./artifact-file-detail";
import { useArtifacts } from "./context";

/**
 * ArtifactPreviewOverlay — full-screen modal-style preview for a
 * selected chat artifact.
 *
 * Replaces the old right-side "split" preview with a dedicated page-level
 * surface: the artifact renders centred on a muted backdrop, with a
 * fixed top-right toolbar containing **下载** (direct download of the
 * selected file) and **返回任务** (close overlay, return to chat). Works
 * for every supported artifact type today (markdown / html report / code
 * file / skill package) and any HTML report the agent produces tomorrow.
 */
export function ArtifactPreviewOverlay({
  threadId,
  className,
}: {
  threadId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { open, selectedArtifact, setOpen } = useArtifacts();

  const handleDownload = useCallback(() => {
    if (!selectedArtifact) return;
    void downloadArtifactUrl(
      urlOfArtifact({ filepath: selectedArtifact, threadId, download: true }),
      getFileName(selectedArtifact),
    );
  }, [selectedArtifact, threadId]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  if (!open || !selectedArtifact) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Artifact preview"
      className={cn(
        "bg-background/95 fixed inset-0 z-50 flex min-h-0 flex-col backdrop-blur-sm",
        className,
      )}
    >
      {/* Reserve the desktop title-bar/drag region for every preview type.
          Interactive controls opt out of dragging; file content begins below
          this shared header instead of rendering under it. */}
      <div className="bg-background/90 relative z-20 flex h-12 shrink-0 items-center justify-end border-b px-4 backdrop-blur [-webkit-app-region:drag]">
        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <Button
            size="sm"
            variant="outline"
            className="bg-background/80 gap-1.5 backdrop-blur"
            onClick={handleDownload}
            aria-label={t.common.download}
          >
            <DownloadIcon className="size-4" />
            <span>{t.common.download}</span>
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleClose}
            aria-label="返回任务"
          >
            <ArrowLeftIcon className="size-4" />
            <span>返回任务</span>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden [-webkit-app-region:no-drag]">
        <ArtifactFileDetail
          className="size-full rounded-none border-0 shadow-none"
          hideHeader
          filepath={selectedArtifact}
          threadId={threadId}
        />
      </div>
    </div>
  );
}
