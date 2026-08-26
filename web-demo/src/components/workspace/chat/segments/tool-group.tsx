"use client";

import {
  CheckIcon,
  ChevronRightIcon,
  Loader2Icon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";

import type { ToolActivityStep } from "@/core/messages/segments";
import { cn } from "@/lib/utils";

function toolIcon(name: string) {
  if (
    name === "web_search" ||
    name === "image_search" ||
    name === "grep"
  )
    return "search";
  if (name === "web_fetch" || name === "web_request") return "globe";
  if (name === "bash" || name === "python") return "terminal";
  if (
    name === "read_file" ||
    name === "write_file" ||
    name === "edit_file" ||
    name === "str_replace" ||
    name === "ls" ||
    name === "glob"
  )
    return "file";
  return "wrench";
}

function iconGlyph(kind: string): React.ReactNode {
  switch (kind) {
    case "search":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "globe":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      );
    case "terminal":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" x2="20" y1="19" y2="19" />
        </svg>
      );
    case "file":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      );
    default:
      return <WrenchIcon className="size-3.5" />;
  }
}

/** Chinese display labels for known tools — raw tool names never surface in the UI. */
const TOOL_LABELS: Record<string, string> = {
  // sandbox file / shell tools
  read_file: "读取文件",
  write_file: "写入文件",
  edit_file: "编辑文件",
  str_replace: "编辑文件",
  ls: "列出目录",
  glob: "匹配文件",
  grep: "搜索内容",
  bash: "执行命令",
  python: "运行代码",
  // web tools
  web_search: "网页搜索",
  image_search: "图片搜索",
  web_fetch: "抓取网页",
  web_request: "请求网页",
  // builtins
  view_image: "查看图片",
  list_uploaded_files: "列出上传文件",
  present_files: "展示文件",
  ask_clarification: "追问确认",
  tool_search: "搜索工具",
  review_skill_package: "审查技能包",
  invoke_acp_agent: "调用智能体",
  setup_agent: "创建智能体",
  update_agent: "更新智能体",
  task: "子任务",
};

/**
 * Human-readable Chinese label for a tool call. Unknown / MCP tools have
 * no fixed translation — fall back to the most readable form of the raw
 * identifier (last `__` segment, underscores as spaces) so the row never
 * shows an opaque machine name when a friendly one exists.
 */
function toolLabel(name: string): string {
  const known = TOOL_LABELS[name];
  if (known) return known;
  const tail = name.split("__").pop() ?? name;
  return tail.replaceAll("_", " ");
}

/** Arg keys that best identify what a tool call operates on, in priority order. */
const SUMMARY_ARG_KEYS = [
  "file_path",
  "filepath",
  "path",
  "command",
  "code",
  "query",
  "url",
  "pattern",
  "directory",
  "dir",
] as const;

const PATH_ARG_KEYS = new Set(["file_path", "filepath", "path"]);

/**
 * One-line summary of a tool call's primary argument — the file path,
 * command, query, etc. — so each step row is meaningful without expanding
 * it (Cursor/Cline style). Returns the text plus whether it is path-like
 * (paths truncate from the left to keep the file name visible).
 */
function stepSummary(step: ToolActivityStep): {
  text: string;
  isPath: boolean;
} | null {
  const args = step.args ?? {};
  let fallback: string | null = null;
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== "string" || !value.trim()) continue;
    const text = value.trim().replace(/\s+/g, " ");
    if (SUMMARY_ARG_KEYS.includes(key as (typeof SUMMARY_ARG_KEYS)[number])) {
      return { text, isPath: PATH_ARG_KEYS.has(key) };
    }
    fallback ??= text;
  }
  return fallback == null ? null : { text: fallback, isPath: false };
}

function truncateText(text: string, max: number, fromStart: boolean): string {
  if (text.length <= max) return text;
  return fromStart
    ? `…${text.slice(text.length - max)}`
    : `${text.slice(0, max)}…`;
}

/**
 * Collapsed summary label for the whole group: a single call shows its
 * Chinese label + primary argument, multiple calls show the count and
 * the (deduplicated) Chinese labels.
 */
function groupLabel(steps: ToolActivityStep[]): React.ReactNode {
  if (steps.length === 1) {
    const step = steps[0]!;
    const summary = stepSummary(step);
    return (
      <>
        <span className="shrink-0 font-medium">{toolLabel(step.name)}</span>
        {summary && (
          <span className="text-muted-foreground truncate font-mono text-[11px]">
            {truncateText(summary.text, 48, summary.isPath)}
          </span>
        )}
      </>
    );
  }
  const labels = [...new Set(steps.map((step) => toolLabel(step.name)))];
  return (
    <>
      <span className="shrink-0">{steps.length} 个工具调用</span>
      <span className="text-muted-foreground truncate">{labels.join("、")}</span>
    </>
  );
}

/**
 * ToolGroup — ONE collapsed row summarising every tool call made between
 * two prose chunks of the conversation (Cursor/Cline style). Expanding
 * reveals a *flat* list: one borderless entry row per call, each entry
 * toggling its arguments/result as inline plain-text blocks. There is a
 * single visual container — no cards nested inside cards.
 */
export function ToolGroup({
  steps,
  isLoading = false,
  className,
}: {
  steps: ToolActivityStep[];
  isLoading?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (steps.length === 0) return null;

  const running = isLoading && steps.some((step) => step.result === undefined);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/50 bg-muted/20",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2 border-none bg-transparent px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/30",
          running ? "text-blue-500" : "text-muted-foreground",
        )}
      >
        {running ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
        )}
        <span className="text-violet-500 shrink-0">
          <WrenchIcon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {groupLabel(steps)}
        </span>
        <ChevronRightIcon
          className={cn(
            "text-muted-foreground size-3 shrink-0 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-0.5 border-t border-border/40 py-1">
          {steps.map((step) => (
            <ToolEntry key={step.id} step={step} isLoading={isLoading} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One flat entry row inside the expanded group. */
function ToolEntry({
  step,
  isLoading,
}: {
  step: ToolActivityStep;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = toolIcon(step.name);
  const hasArgs = Object.keys(step.args ?? {}).length > 0;
  const hasResult = step.result != null;
  const expandable = hasArgs || hasResult;
  const summary = stepSummary(step);
  const running = isLoading && step.result === undefined;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        disabled={!expandable}
        title={step.name}
        onClick={() => expandable && setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2 border-none bg-transparent px-2.5 py-1 text-left text-xs transition-colors",
          expandable && "hover:bg-muted/30",
          !expandable && "cursor-default",
        )}
      >
        {running ? (
          <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-500" />
        ) : (
          <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        )}
        <span className="text-violet-500 shrink-0">{iconGlyph(kind)}</span>
        <span className="shrink-0 font-medium">{toolLabel(step.name)}</span>
        {summary && (
          <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
            {truncateText(summary.text, 72, summary.isPath)}
          </span>
        )}
        {expandable && (
          <ChevronRightIcon
            className={cn(
              "text-muted-foreground size-3 shrink-0 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        )}
      </button>
      {open && expandable && (
        <div className="space-y-1 py-1 pr-2.5 pl-8">
          {hasArgs && (
            <DetailBlock
              label="参数"
              text={formatValue(step.args)}
            />
          )}
          {hasResult && (
            <DetailBlock
              label="执行结果"
              text={stringify(step.result)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Inline plain-text detail block — no nested bordered cards. */
function DetailBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border-l-2 border-border/60 bg-muted/30 py-1 pr-2 pl-2">
      <div className="text-muted-foreground/70 text-[10px]">{label}</div>
      <pre className="text-muted-foreground max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

const MAX_TOOL_VALUE_CHARS = 8000;

function formatValue(value: unknown): string {
  if (typeof value === "string") return truncate(value, MAX_TOOL_VALUE_CHARS);
  if (value == null) return String(value);
  return truncate(JSON.stringify(value, null, 2), MAX_TOOL_VALUE_CHARS);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return truncate(value, MAX_TOOL_VALUE_CHARS);
  if (value == null) return String(value);
  return truncate(JSON.stringify(value, null, 2), MAX_TOOL_VALUE_CHARS);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
