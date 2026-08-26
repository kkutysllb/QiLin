"use client";

import {
  FileDiffIcon,
  FileMinusIcon,
  FilePlusIcon,
  FileTextIcon,
  Loader2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { WorkspaceFileChange } from "@/core/threads/workspace-changes";
import { useActiveThreadId, useActiveThreadMessages } from "@/hooks/use-active-thread";
import { useWorkspaceChanges } from "@/hooks/use-workspace-changes";
import { cn } from "@/lib/utils";

import { PanelEmpty, PanelSection } from "../panel-section";

/**
 * WorkspaceChangesSection — per-turn file audit ("本次运行改了哪些文件"):
 * the recorder's summary counts plus a per-file list with status,
 * +/- line counts, and expandable diffs. Sensitive files never expose
 * their diff in the UI.
 */
export function WorkspaceChangesSection() {
  const threadId = useActiveThreadId();
  const { messages } = useActiveThreadMessages();
  // One refetch per completed turn — the human-message count only changes
  // when a new turn starts, i.e. after the previous turn's recorder flush.
  const turnSignal = useMemo(
    () => messages.filter((msg) => msg.type === "human").length,
    [messages],
  );
  const { data, isPending } = useWorkspaceChanges(threadId, turnSignal);

  const files = data?.files ?? [];
  const summary = data?.summary;
  const changeCount =
    (summary?.created ?? 0) +
    (summary?.modified ?? 0) +
    (summary?.deleted ?? 0);

  return (
    <PanelSection
      id="workspaceChanges"
      icon={FileDiffIcon}
      title="文件变更"
      count={changeCount}
    >
      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          加载变更记录…
        </div>
      ) : files.length === 0 ? (
        <PanelEmpty text="暂无文件变更" />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {summary && summary.created > 0 && (
              <SummaryChip label={`新建 ${summary.created}`} tone="add" />
            )}
            {summary && summary.modified > 0 && (
              <SummaryChip label={`修改 ${summary.modified}`} tone="mod" />
            )}
            {summary && summary.deleted > 0 && (
              <SummaryChip label={`删除 ${summary.deleted}`} tone="del" />
            )}
            {summary != null && summary.additions + summary.deletions > 0 && (
              <span className="text-muted-foreground font-mono">
                <span className="text-emerald-600">+{summary.additions}</span>{" "}
                <span className="text-rose-500">-{summary.deletions}</span>
              </span>
            )}
            {summary?.truncated && (
              <span className="text-amber-500">（部分变更未记录）</span>
            )}
          </div>
          <ul className="space-y-0.5">
            {files.map((file, index) => (
              <WorkspaceChangeRow
                key={`${file.path}-${index}`}
                file={file}
              />
            ))}
          </ul>
        </div>
      )}
    </PanelSection>
  );
}

function SummaryChip({
  label,
  tone,
}: {
  label: string;
  tone: "add" | "mod" | "del";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5",
        tone === "add" && "bg-emerald-500/10 text-emerald-600",
        tone === "mod" && "bg-blue-500/10 text-blue-600",
        tone === "del" && "bg-rose-500/10 text-rose-500",
      )}
    >
      {label}
    </span>
  );
}

const STATUS_META: Record<
  string,
  { icon: typeof FilePlusIcon; className: string; label: string }
> = {
  created: {
    icon: FilePlusIcon,
    className: "text-emerald-600",
    label: "新建",
  },
  modified: { icon: FileTextIcon, className: "text-blue-500", label: "修改" },
  deleted: { icon: FileMinusIcon, className: "text-rose-500", label: "删除" },
};

function WorkspaceChangeRow({ file }: { file: WorkspaceFileChange }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[file.status] ?? STATUS_META.modified!;
  const Icon = meta.icon;
  const hasDiff =
    !file.sensitive && !file.binary && file.diff.trim().length > 0;
  const filename = file.path.split("/").pop() ?? file.path;
  const directory = file.path.slice(0, file.path.length - filename.length);

  return (
    <li>
      <button
        type="button"
        disabled={!hasDiff}
        onClick={() => hasDiff && setExpanded((value) => !value)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs",
          hasDiff ? "hover:bg-muted/50" : "cursor-default",
        )}
        title={file.path}
      >
        <Icon className={cn("size-3.5 shrink-0", meta.className)} />
        <span className="truncate font-medium">{filename}</span>
        {file.sensitive && (
          <span className="shrink-0 rounded bg-amber-500/10 px-1 text-[10px] text-amber-600">
            敏感
          </span>
        )}
        {file.binary && (
          <span className="text-muted-foreground shrink-0 text-[10px]">
            二进制
          </span>
        )}
        {file.additions + file.deletions > 0 && (
          <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[10px]">
            <span className="text-emerald-600">+{file.additions}</span>
            <span className="text-rose-500"> -{file.deletions}</span>
          </span>
        )}
      </button>
      {expanded && hasDiff && (
        <pre className="bg-muted/30 mt-0.5 mb-1 max-h-48 overflow-auto rounded-md p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
          {file.diff}
          {file.diff_truncated && (
            <span className="text-amber-500">…（diff 已截断）</span>
          )}
        </pre>
      )}
      {!expanded && directory && (
        <div className="text-muted-foreground/60 truncate pr-1 pl-6 text-[10px]">
          {directory}
        </div>
      )}
    </li>
  );
}
