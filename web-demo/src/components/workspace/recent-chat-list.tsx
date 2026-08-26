"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  FileText,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { getAPIClient } from "@/core/api";
import { useI18n } from "@/core/i18n/hooks";
import { useWorkspaceLayout } from "./workspace-layout-context";
import {
  exportThreadAsJSON,
  exportThreadAsMarkdown,
} from "@/core/threads/export";
import {
  useDeleteThread,
  useRenameThread,
  useThreads,
} from "@/core/threads/hooks";
import { prefetchThreadState } from "@/core/threads/prefetch";
import type { AgentThread, AgentThreadState } from "@/core/threads/types";
import { pathOfThread, titleOfThread } from "@/core/threads/utils";
import { bucketOfThread, formatSmartTime, type ThreadTimeBucket } from "@/core/utils/datetime";
import { env } from "@/env";
import { isIMEComposing } from "@/lib/ime";

function parseThreadIdFromPath(pathname: string | null): string {
  if (!pathname) return "new";
  const match = /\/chats\/([^/?#]+)/.exec(pathname);
  const raw = match?.[1];
  if (!raw) return "new";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseAgentNameFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const match = /\/workspace\/agents\/([^/]+)\//.exec(pathname);
  const raw = match?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function RecentChatList() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { historyCollapsed, toggleHistory } = useWorkspaceLayout();
  // In the Electron desktop build, useParams() returns stale values from the
  // pre-rendered new.html RSC payload. Parse thread_id and agent_name from
  // the real URL pathname instead.
  const threadIdFromPath = parseThreadIdFromPath(pathname);
  const agentNameFromPath = parseAgentNameFromPath(pathname);
  const { data: threads = [] } = useThreads();
  const { mutate: deleteThread } = useDeleteThread();
  const { mutate: renameThread } = useRenameThread();

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Bucket grouping state
  const [openBuckets, setOpenBuckets] = useState<Set<ThreadTimeBucket>>(
    new Set<ThreadTimeBucket>(["recent3"]),
  );

  const groupedThreads = useMemo(() => {
    const groups: Record<ThreadTimeBucket, AgentThread[]> = {
      recent3: [],
      thisWeek: [],
      thisMonth: [],
      earlier: [],
    };
    for (const thread of threads) {
      const bucket = bucketOfThread(thread.updated_at);
      groups[bucket].push(thread);
    }
    return groups;
  }, [threads]);

  const bucketOrder: ThreadTimeBucket[] = [
    "recent3",
    "thisWeek",
    "thisMonth",
    "earlier",
  ];

  const toggleBucket = useCallback((bucket: ThreadTimeBucket) => {
    setOpenBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(
    (threadId: string) => {
      deleteThread({ threadId });
      if (threadId === threadIdFromPath) {
        const threadIndex = threads.findIndex((t) => t.thread_id === threadId);
        let nextThreadPath = pathOfThread("new", {
          agent_name: agentNameFromPath,
        });
        if (threadIndex > -1) {
          if (threads[threadIndex + 1]) {
            nextThreadPath = pathOfThread(threads[threadIndex + 1]!);
          } else if (threads[threadIndex - 1]) {
            nextThreadPath = pathOfThread(threads[threadIndex - 1]!);
          }
        }
        void router.push(nextThreadPath);
      }
    },
    [agentNameFromPath, deleteThread, router, threadIdFromPath, threads],
  );

  const handleRenameClick = useCallback(
    (threadId: string, currentTitle: string) => {
      setRenameThreadId(threadId);
      setRenameValue(currentTitle);
      setRenameDialogOpen(true);
    },
    [],
  );

  const handleRenameSubmit = useCallback(() => {
    if (renameThreadId && renameValue.trim()) {
      renameThread({ threadId: renameThreadId, title: renameValue.trim() });
      setRenameDialogOpen(false);
      setRenameThreadId(null);
      setRenameValue("");
    }
  }, [renameThread, renameThreadId, renameValue]);

  const handleShare = useCallback(
    async (thread: AgentThread) => {
      // Always use Vercel URL for sharing so others can access
      const VERCEL_URL = "https://kworks.com";
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      // On localhost: use Vercel URL; On production: use current origin
      const baseUrl = isLocalhost ? VERCEL_URL : window.location.origin;
      const shareUrl = `${baseUrl}${pathOfThread(thread)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t.clipboard.linkCopied);
      } catch {
        toast.error(t.clipboard.failedToCopyToClipboard);
      }
    },
    [t],
  );

  const handleExport = useCallback(
    async (thread: AgentThread, format: "markdown" | "json") => {
      try {
        const apiClient = getAPIClient();
        const state = await apiClient.threads.getState<AgentThreadState>(
          thread.thread_id,
        );
        const messages = state.values?.messages ?? [];
        if (messages.length === 0) {
          toast.error(t.conversation.noMessages);
          return;
        }
        if (format === "markdown") {
          exportThreadAsMarkdown(thread, messages);
        } else {
          exportThreadAsJSON(thread, messages);
        }
        toast.success(t.common.exportSuccess);
      } catch {
        toast.error("Failed to export conversation");
      }
    },
    [t],
  );

  // 历史会话段整体折叠：只显示标题条
  if (historyCollapsed) {
    return (
      <SidebarGroup className="pt-1">
        <SidebarGroupLabel
          asChild
          className="cursor-pointer"
        >
          <button type="button" onClick={toggleHistory}>
            <span className="truncate">{t.sidebar.recentChats}</span>
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {threads.length}
            </span>
            <span className="ml-1.5 text-muted-foreground">
              <ChevronRight className="size-3.5" />
            </span>
          </button>
        </SidebarGroupLabel>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup className="pt-1">
        <SidebarGroupLabel
          asChild
          className="cursor-pointer"
        >
          <button type="button" onClick={toggleHistory}>
            <span className="truncate">{t.sidebar.recentChats}</span>
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {threads.length}
            </span>
            <span className="ml-1.5 text-muted-foreground">
              <ChevronDown className="size-3.5" />
            </span>
          </button>
        </SidebarGroupLabel>
        <SidebarGroupContent className="group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">
          <SidebarMenu>
            <div className="flex w-full flex-col gap-1">
              {bucketOrder.map((bucket) => {
                const items = groupedThreads[bucket];
                const isOpen = openBuckets.has(bucket);
                const bucketLabel: Record<ThreadTimeBucket, string> = {
                  recent3: t.sidebar.recent3,
                  thisWeek: t.sidebar.thisWeek,
                  thisMonth: t.sidebar.thisMonth,
                  earlier: t.sidebar.earlier,
                };
                return (
                  <div key={bucket} className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleBucket(bucket)}
                      className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-2 py-1 text-[11px] font-medium tracking-wide uppercase"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      <span className="truncate">{bucketLabel[bucket]}</span>
                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground tabular-nums">
                        {items.length}
                      </span>
                    </button>
                    {isOpen &&
                      items.map((thread) => {
                        const isActive = pathOfThread(thread) === pathname;
                        return (
                          <SidebarMenuItem
                            key={thread.thread_id}
                            className="group/side-menu-item"
                          >
                            <SidebarMenuButton isActive={isActive} asChild>
                              <div className="flex w-full items-center gap-2">
                                <Link
                                  className="text-muted-foreground min-w-0 flex-1 truncate"
                                  href={pathOfThread(thread)}
                                  onMouseEnter={() =>
                                    void prefetchThreadState(thread.thread_id)
                                  }
                                  onFocus={() =>
                                    void prefetchThreadState(thread.thread_id)
                                  }
                                >
                                  {titleOfThread(thread)}
                                </Link>
                                <span className="text-muted-foreground/70 shrink-0 text-[10px] tabular-nums transition-opacity group-hover/side-menu-item:opacity-0">
                                  {formatSmartTime(thread.updated_at, locale)}
                                </span>
                                {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY !==
                          "true" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <SidebarMenuAction
                                        showOnHover
                                        className="bg-background/50 hover:bg-background"
                                      >
                                        <MoreHorizontal />
                                        <span className="sr-only">
                                          {t.common.more}
                                        </span>
                                      </SidebarMenuAction>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      className="w-48 rounded-lg"
                                      side={"right"}
                                      align={"start"}
                                    >
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          handleRenameClick(
                                            thread.thread_id,
                                            titleOfThread(thread),
                                          )
                                        }
                                      >
                                        <Pencil className="text-blue-500" />
                                        <span>{t.common.rename}</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onSelect={() => handleShare(thread)}
                                      >
                                        <Share2 className="text-emerald-500" />
                                        <span>{t.common.share}</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                          <Download className="text-violet-500" />
                                          <span>{t.common.export}</span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              handleExport(thread, "markdown")
                                            }
                                          >
                                            <FileText className="text-cyan-500" />
                                            <span>
                                              {t.common.exportAsMarkdown}
                                            </span>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              handleExport(thread, "json")
                                            }
                                          >
                                            <FileJson className="text-amber-500" />
                                            <span>
                                              {t.common.exportAsJSON}
                                            </span>
                                          </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          handleDelete(thread.thread_id)
                                        }
                                      >
                                        <Trash2 className="text-rose-500" />
                                        <span>{t.common.delete}</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t.common.rename}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t.common.rename}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isIMEComposing(e)) {
                  e.preventDefault();
                  handleRenameSubmit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button onClick={handleRenameSubmit}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
