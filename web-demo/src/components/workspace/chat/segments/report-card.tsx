"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  LoaderIcon,
  Maximize2Icon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArtifactFilePreview } from "@/components/workspace/artifacts/artifact-file-preview";
import { useArtifactContent } from "@/core/artifacts/hooks";
import { checkCodeFile, getFileName } from "@/core/utils/files";
import { cn } from "@/lib/utils";

/**
 * 聊天内联 HTML 报告卡片：present_files 交付 .html 报告时在对话流中
 * 直接预览（blob + sandbox iframe，可运行内嵌 ECharts），支持收起/展开
 * 与全屏。非 .html 文件返回 null，由调用方过滤。
 */
export function ReportCard({
  filepath,
  threadId,
  className,
}: {
  filepath: string;
  threadId: string;
  className?: string;
}) {
  const isHtml = checkCodeFile(filepath).language === "html";
  const { content, isLoading, error } = useArtifactContent({
    filepath,
    threadId,
    enabled: isHtml,
  });
  const [expanded, setExpanded] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  if (!isHtml) {
    return null;
  }

  const preview = (
    <ArtifactFilePreview content={content ?? ""} language="html" />
  );

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border/50 bg-background/85 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <FileTextIcon className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {getFileName(filepath)}
          </span>
          {isLoading && (
            <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            onClick={() => setFullscreen(true)}
            aria-label="全屏预览报告"
            title="全屏预览"
          >
            <Maximize2Icon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "收起报告" : "展开报告"}
            title={expanded ? "收起" : "展开"}
          >
            {expanded ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </Button>
        </div>
        <div
          className={cn(
            "transition-all duration-300 ease-out",
            expanded ? "h-[60vh]" : "h-0",
          )}
        >
          {error ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              报告加载失败
            </div>
          ) : (
            preview
          )}
        </div>
      </div>
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="flex h-[90vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 p-0">
          <DialogTitle className="sr-only">
            {getFileName(filepath)}
          </DialogTitle>
          <div className="min-h-0 flex-1">{preview}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
