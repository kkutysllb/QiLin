"use client";

/**
 * 侧栏「历史任务」区 —— 工作区分组树（DSH ui-workspace 对齐）。
 *
 * 数据面：useThreads() 的线程摘要 × useWorkspaceTree() 的注册表投影，
 * 经 buildSidebarInputs 组装后交给 deriveGroups 纯函数推导渲染节。
 * 交互面：组头折叠记忆（collapsedGroups）、工作区重命名/相邻换位/删除登记、
 * 会话归档、Ungrouped 成员的人工归组（计划 §6）。拖拽排序按计划决策点
 * 暂以上移/下移菜单等价替代，后续可无缝升级 @dnd-kit。
 */

import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowUpDown,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FolderIcon,
  FolderOpen,
  PlusIcon,
  Download,
  FileJson,
  FileText,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  SquarePlus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { AgentThreadState } from "@/core/threads/types";
import { pathOfThread, titleOfThread } from "@/core/threads/utils";
import {
  formatSmartTime,
} from "@/core/utils/datetime";
import {
  usePickDirectory,
  useArchiveThreads,
  useAttachThread,
  useCreateWorkspace,
  useDeleteWorkspace,
  useDetachThread,
  useRenameWorkspace,
  useReorderThread,
  useReorderWorkspace,
  useUnarchiveThreads,
  useWorkspaceTree,
} from "@/core/workspaces/hooks";
import {
  buildSidebarInputs,
  type ThreadLike,
} from "@/core/workspaces/sidebar-inputs";
import { useWorkspaceViewCollapse } from "@/core/workspaces/view-state";
import { env } from "@/env";
import { isIMEComposing } from "@/lib/ime";
import {
  deriveGroups,
  sortWorkspacesByRecent,
  UNGROUPED_KEY,
  type GroupNode,
} from "@/lib/workspace-tree";

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

interface ThreadActionHandlers {
  locale: string;
  onDelete: (threadId: string) => void;
  onRenameClick: (threadId: string, currentTitle: string) => void;
  onShare: (threadId: string) => void;
  onExport: (threadId: string, title: string, format: "markdown" | "json") => void;
  onArchive: (threadId: string) => void;
  onMoveTo: (workspaceId: string | null, threadId: string) => void;
  onMoveUpDown: (
    direction: "up" | "down",
    threadId: string,
    siblingIds: readonly string[],
  ) => void;
  groupOptions: ReadonlyArray<{ id: string; label: string }>;
  siblingsOf: (threadId: string) => readonly string[];
  staticWebsiteOnly: boolean;
}

function ThreadActionsMenu({
  threadId,
  title,
  handlers,
}: {
  threadId: string;
  title: string;
  handlers: ThreadActionHandlers;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction showOnHover className="bg-background/50 hover:bg-background">
          <MoreHorizontal />
          <span className="sr-only">{t.common.more}</span>
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 rounded-lg" side="right" align="start">
        <DropdownMenuItem onSelect={() => handlers.onRenameClick(threadId, title)}>
          <Pencil className="text-blue-500" />
          <span>{t.common.rename}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handlers.onShare(threadId)}>
          <Share2 className="text-emerald-500" />
          <span>{t.common.share}</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="text-violet-500" />
            <span>{t.common.export}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => handlers.onExport(threadId, title, "markdown")}>
              <FileText className="text-cyan-500" />
              <span>{t.common.exportAsMarkdown}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onExport(threadId, title, "json")}>
              <FileJson className="text-amber-500" />
              <span>{t.common.exportAsJSON}</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {!handlers.staticWebsiteOnly && (
          <>
            <DropdownMenuItem onSelect={() => handlers.onArchive(threadId)}>
              <Archive className="text-orange-500" />
              <span>{t.sidebar.archiveThread}</span>
            </DropdownMenuItem>
            {handlers.groupOptions.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="text-sky-500" />
                  <span>{t.sidebar.moveToWorkspace}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => handlers.onMoveTo(null, threadId)}>
                    <span>{t.sidebar.ungroupedGroup}</span>
                  </DropdownMenuItem>
                  {handlers.groupOptions.map((g) => (
                    <DropdownMenuItem key={g.id} onSelect={() => handlers.onMoveTo(g.id, threadId)}>
                      <span className="truncate">{g.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {siblingsOverflow(handlers.siblingsOf(threadId)) && (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    handlers.onMoveUpDown("up", threadId, handlers.siblingsOf(threadId))
                  }
                >
                  <ChevronRight className="size-3 -rotate-90 text-muted-foreground" />
                  <span>{t.sidebar.moveUpItem}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    handlers.onMoveUpDown("down", threadId, handlers.siblingsOf(threadId))
                  }
                >
                  <ChevronRight className="size-3 rotate-90 text-muted-foreground" />
                  <span>{t.sidebar.moveDownItem}</span>
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handlers.onDelete(threadId)}>
          <Trash2 className="text-rose-500" />
          <span>{t.common.delete}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 只有超过一个成员的账户才提供行级排序。 */
function siblingsOverflow(ids: readonly string[]): boolean {
  return ids.length > 1;
}

export function RecentChatList() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  // In the Electron desktop build, useParams() returns stale values from the
  // pre-rendered new.html RSC payload. Parse thread_id and agent_name from
  // the real URL pathname instead.
  const threadIdFromPath = parseThreadIdFromPath(pathname);
  const agentNameFromPath = parseAgentNameFromPath(pathname);
  const { data: threads = [] } = useThreads();
  const { data: tree } = useWorkspaceTree();
  const queryClient = useQueryClient();

  // 新会话（线程列表的新增 id）出现时，注册表树可能尚未反映其 workspace
  // 归组：后端在 run 启动时 attach，而前端 tree query 仅被 workspace mutation
  // 失效，与线程列表 query 相互独立。若只刷新线程列表，新线程会被兜底进
  // Ungrouped。这里检测到列表新增 id 后失效 ["workspaces"] 让树重取最新分组。
  // 用 ref 记录上轮 id 集，避免真正未分组线程反复触发失效。
  const knownThreadIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const listIds = new Set(threads.map((t) => t.thread_id));
    if (knownThreadIdsRef.current === null) {
      knownThreadIdsRef.current = listIds;
      return;
    }
    let hasNew = false;
    for (const id of listIds) {
      if (!knownThreadIdsRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }
    knownThreadIdsRef.current = listIds;
    if (hasNew && tree !== undefined) {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    }
  }, [threads, tree, queryClient]);

  const { mutate: deleteThread } = useDeleteThread();
  const { mutate: renameThread } = useRenameThread();

  const { mutateAsync: renameWorkspace } = useRenameWorkspace();
  const { mutateAsync: reorderWorkspaceMutate } = useReorderWorkspace();
  const { mutateAsync: deleteWorkspaceMutate } = useDeleteWorkspace();
  const { mutateAsync: attachThreadMutate } = useAttachThread();
  const { mutateAsync: detachThreadMutate } = useDetachThread();
  const { mutateAsync: reorderThreadMutate } = useReorderThread();
  const { mutateAsync: archiveThreadsMutate } = useArchiveThreads();
  const { mutateAsync: unarchiveThreadsMutate } = useUnarchiveThreads();

  // ── 树推导输入与视图状态 ──────────────────────────────────────────
  const inputs = useMemo(() => {
    const summaries: ThreadLike[] = threads.map((thread) => ({
      thread_id: thread.thread_id,
      title: titleOfThread(thread),
      updated_at: thread.updated_at,
    }));
    return buildSidebarInputs(summaries, tree);
  }, [threads, tree]);

  const { isCollapsed, toggleCollapse, retainKeys } = useWorkspaceViewCollapse();

  const knownKeys = useMemo(() => {
    const keys = inputs.groups.map((g) => g.id);
    // Ungrouped 桶只有存在成员时才出现；存在与否由派生层决定，
    // 这里预置键位让用户可以提前折叠它。
    keys.push(UNGROUPED_KEY);
    return keys;
  }, [inputs.groups]);

  useEffect(() => {
    retainKeys(new Set(knownKeys));
  }, [retainKeys, knownKeys]);

  const expandedGroups = useMemo(
    () => new Set(knownKeys.filter((k) => !isCollapsed(k))),
    [knownKeys, isCollapsed],
  );

  const currentThreadId =
    threadIdFromPath === "new" ? undefined : threadIdFromPath;


  // 注册表持久序（父级兄弟排序的锚点来源）
  const orderedGroupMeta = useMemo(
    () => inputs.groups.map((g) => ({ id: g.id, title: g.title })),
    [inputs.groups],
  );


  const archivedEntries = useMemo(() => {
    const entries = (tree?.archived_thread_ids ?? []).map((id) => ({
      id,
      title: inputs.list.byId[id]?.title ?? id,
    }));
    return entries.sort((a, b) => a.title.localeCompare(b.title));
  }, [tree, inputs.list]);

  const staticWebsiteOnly = env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true";

  // ── 会话级行为（保留原有语义） ───────────────────────────────────
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

// ── 工作区节：搜索 / 排序 / 添加（DSH 截图一） ─────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<"manual" | "recent">(() => {
    if (typeof window === "undefined") return "manual";
    try {
      return window.localStorage.getItem("kworks.workspace.sortMode") === "recent"
        ? "recent"
        : "manual";
    } catch {
      return "manual";
    }
  });
  const { mutateAsync: createWorkspaceMutate } = useCreateWorkspace();
  const { mutateAsync: pickDirectoryMutate } = usePickDirectory();

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open) setSearchText("");
      return !open;
    });
  }, []);

  const changeSortMode = useCallback((mode: "manual" | "recent") => {
    setSortMode(mode);
    try {
      window.localStorage.setItem("kworks.workspace.sortMode", mode);
    } catch {
      // 忽略持久化失败，会话内状态即可
    }
  }, []);

  // 添加工作区一步到位（DSH host.pickDirectory 语义）：点击即弹系统目录
  // 选择器，选中后以目录 basename 作为默认标题直接创建；用户取消则静默返回。
  const quickAddWorkspace = useCallback(async () => {
    try {
      const path = await pickDirectoryMutate();
      if (!path) return;
      await createWorkspaceMutate({ path });
      toast.success(t.sidebar.addWorkspace);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [createWorkspaceMutate, pickDirectoryMutate, t]);

  const orderedGroupsForTree = useMemo(() => {
    if (sortMode !== "recent") return inputs.groups;
    const byId = new Map(inputs.list.ids.map((id) => [id, inputs.list.byId[id]!]));
    return sortWorkspacesByRecent(inputs.groups, byId);
  }, [inputs, sortMode]);

  const groupNodes = useMemo(
    () =>
      deriveGroups(
        inputs.list,
        sortMode === "recent" ? orderedGroupsForTree : inputs.groups,
        tree?.archived_thread_ids ?? [],
        { expandedGroups: [...expandedGroups] },
        currentThreadId,
      ),
    [inputs, tree, expandedGroups, currentThreadId, orderedGroupsForTree, sortMode],
  );
  const filteredGroupNodes = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return groupNodes;
    return groupNodes
      .map((node) => ({
        ...node,
        expanded: true,
        sessions: node.sessions.filter(
          (session) =>
            session.title.toLowerCase().includes(needle) ||
            node.label.toLowerCase().includes(needle),
        ),
      }))
      .filter(
        (node) =>
          node.label.toLowerCase().includes(needle) ||
          node.sessions.length > 0 ||
          node.sessionCount > 0,
      );
  }, [groupNodes, searchText]);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleRenameClick = useCallback((threadId: string, currentTitle: string) => {
    setRenameThreadId(threadId);
    setRenameValue(currentTitle);
    setRenameDialogOpen(true);
  }, []);

  const handleRenameSubmit = useCallback(() => {
    if (renameThreadId && renameValue.trim()) {
      renameThread({ threadId: renameThreadId, title: renameValue.trim() });
      setRenameDialogOpen(false);
      setRenameThreadId(null);
      setRenameValue("");
    }
  }, [renameThread, renameThreadId, renameValue]);

  const handleShare = useCallback(
    async (threadId: string) => {
      const thread = threads.find((t) => t.thread_id === threadId);
      if (!thread) return;
      const shareUrl = `${window.location.origin}${pathOfThread(thread)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t.clipboard.linkCopied);
      } catch {
        toast.error(t.clipboard.failedToCopyToClipboard);
      }
    },
    [t, threads],
  );

  const handleExport = useCallback(
    async (threadId: string, _title: string, format: "markdown" | "json") => {
      const thread = threads.find((t) => t.thread_id === threadId);
      if (!thread) return;
      try {
        const apiClient = getAPIClient();
        const state = await apiClient.threads.getState<AgentThreadState>(threadId);
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
    [t, threads],
  );

  // ── 工作区 / 归档动作 ────────────────────────────────────────────
  const handleArchive = useCallback(
    (threadId: string) => {
      archiveThreadsMutate([threadId]).then(
        () => toast.success(t.sidebar.archiveThread),
        () => toast.error(t.sidebar.archiveThread),
      );
    },
    [archiveThreadsMutate, t],
  );

  const handleMoveTo = useCallback(
    (workspaceId: string | null, threadId: string) => {
      const current = owningGroupKey(inputs, threadId);
      if (workspaceId === null) {
        if (current === undefined) return; // 已在 Ungrouped
        void detachThreadMutate({ workspaceId: current, threadId }).catch(() =>
          toast.error(t.sidebar.moveToWorkspace),
        );
        return;
      }
      if (current === workspaceId) return; // 原地归组是 no-op
      void attachThreadMutate({ workspaceId, threadId }).catch(() =>
        toast.error(t.sidebar.moveToWorkspace),
      );
    },
    [attachThreadMutate, detachThreadMutate, inputs, t],
  );

  const handleThreadMoveUpDown = useCallback(
    (direction: "up" | "down", threadId: string, siblingIds: readonly string[]) => {
      const index = siblingIds.indexOf(threadId);
      if (index < 0) return;
      const beforeId =
        direction === "up"
          ? index > 0
            ? (siblingIds[index - 1] ?? null)
            : undefined // 已在顶部：no-op
          : index + 2 <= siblingIds.length
            ? (siblingIds[index + 2] ?? null)
            : undefined;
      if (beforeId === undefined) return;
      const groupId = owningGroupKey(inputs, threadId);
      if (!groupId) return;
      void reorderThreadMutate({
        workspaceId: groupId,
        threadId,
        beforeThreadId: beforeId,
      }).catch(() => toast.error(t.sidebar.moveUpItem));
    },
    [inputs, reorderThreadMutate, t],
  );

  const handleWorkspaceMove = useCallback(
    (direction: "up" | "down", workspaceId: string) => {
      const ids = orderedGroupMeta.map((g) => g.id);
      const index = ids.indexOf(workspaceId);
      if (index < 0) return;
      let beforeId: string | null | undefined;
      if (direction === "up") {
        beforeId = index > 0 ? (ids[index - 1] ?? null) : undefined;
      } else {
        beforeId = index + 2 <= ids.length ? (ids[index + 2] ?? null) : undefined;
      }
      if (beforeId === undefined) return;
      void reorderWorkspaceMutate({ workspaceId, beforeId }).catch(() =>
        toast.error(t.sidebar.moveDownItem),
      );
    },
    [orderedGroupMeta, reorderWorkspaceMutate, t],
  );

  const handleWorkspaceDelete = useCallback(
    (workspaceId: string) => {
      void deleteWorkspaceMutate(workspaceId).catch(() =>
        toast.error(t.sidebar.deleteWorkspaceAction),
      );
    },
    [deleteWorkspaceMutate, t],
  );

  // ── 工作区重命名对话框 ──────────────────────────────────────────
  const [wsDialogOpen, setWsDialogOpen] = useState(false);
  const [wsDialogId, setWsDialogId] = useState<string | null>(null);
  const [wsDialogValue, setWsDialogValue] = useState("");

  const openWorkspaceRename = useCallback((workspaceId: string, title: string) => {
    setWsDialogId(workspaceId);
    setWsDialogValue(title);
    setWsDialogOpen(true);
  }, []);

  const submitWorkspaceRename = useCallback(() => {
    if (wsDialogId && wsDialogValue.trim()) {
      void renameWorkspace({ workspaceId: wsDialogId, title: wsDialogValue.trim() });
    }
    setWsDialogOpen(false);
    setWsDialogId(null);
    setWsDialogValue("");
  }, [renameWorkspace, wsDialogId, wsDialogValue]);

  const threadHandlers = useMemo<ThreadActionHandlers>(
    () => ({
      locale,
      onDelete: handleDelete,
      onRenameClick: handleRenameClick,
      onShare: (threadId) => void handleShare(threadId),
      onExport: (threadId, title, format) => void handleExport(threadId, title, format),
      onArchive: handleArchive,
      onMoveTo: handleMoveTo,
      onMoveUpDown: handleThreadMoveUpDown,
      groupOptions: orderedGroupMeta.map((g) => ({ id: g.id, label: g.title })),
      siblingsOf: (threadId: string) =>
        inputs.groups.find((g) => g.threadIds.includes(threadId))?.threadIds ?? [],
      staticWebsiteOnly,
    }),
    [
      handleArchive,
      handleDelete,
      handleExport,
      handleMoveTo,
      handleRenameClick,
      handleShare,
      handleThreadMoveUpDown,
      inputs.groups,
      locale,
      orderedGroupMeta,
      staticWebsiteOnly,
    ],
  );

  const renderSessionRow = useCallback(
    (node: GroupNode, session: { id: string; title: string }) => {
      const thread = threads.find((t) => t.thread_id === session.id);
      const isActive = thread ? pathOfThread(thread) === pathname : session.id === currentThreadId;
      return (
        <SidebarMenuItem key={`${node.key}:${session.id}`} className="group/side-menu-item">
          <SidebarMenuButton isActive={isActive} asChild>
            <div className="flex w-full items-center gap-2 pl-3">
              <Link
                className="text-muted-foreground min-w-0 flex-1 truncate"
                href={thread ? pathOfThread(thread) : "#"}
                onMouseEnter={
                  thread ? () => void prefetchThreadState(session.id) : undefined
                }
                onFocus={
                  thread ? () => void prefetchThreadState(session.id) : undefined
                }
              >
                {session.title}
              </Link>
              {thread && (
                <span className="text-muted-foreground/70 shrink-0 text-[10px] tabular-nums transition-opacity group-hover/side-menu-item:opacity-0">
                  {formatSmartTime(thread.updated_at, locale)}
                </span>
              )}
              {!staticWebsiteOnly && (
                <ThreadActionsMenu
                  threadId={session.id}
                  title={session.title}
                  handlers={threadHandlers}
                />
              )}
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    },
    [currentThreadId, locale, pathname, staticWebsiteOnly, threadHandlers, threads],
  );

  const renderGroupHeader = useCallback(
    (node: GroupNode) => {
      const metaIndex = orderedGroupMeta.findIndex((m) => m.id === node.workspaceId);
      const isUngrouped = node.workspaceId === undefined;
      // 标签回退链：标题为空串时退 basename，再退实体键（?? 不处理空串）。
      const label = isUngrouped
        ? t.sidebar.ungroupedGroup
        : node.label !== ""
          ? node.label
          : (node.cwd ?? "") !== ""
            ? (node.cwd ?? node.key)
            : node.key;
      return (
        <button
          type="button"
          onClick={() => toggleCollapse(node.key)}
          className={`group/wshead flex h-[34px] w-full items-center gap-1.5 rounded px-2 text-sm font-normal normal-case tracking-normal text-foreground ${
            node.containsCurrent ? "bg-muted/60" : "hover:bg-muted/50"
          }`}
        >
          {!isUngrouped && (
            // 工作区组：折叠为合上的灰色文件夹，展开切换为蓝色打开形态；
            // 展开状态由文件夹开合表达，不再显示折叠箭头。
            node.expanded ? (
              <FolderOpen className="size-4 shrink-0 text-blue-500 transition-colors" />
            ) : (
              <FolderIcon className="size-4 shrink-0 text-muted-foreground transition-colors" />
            )
          )}
          {isUngrouped &&
            // Ungrouped 无文件夹图标，箭头是其唯一的展开状态指示，保留。
            (node.expanded ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/70" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
            ))}
          <span className="truncate">{label}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal tabular-nums text-muted-foreground">
              {node.sessionCount > 0 ? node.sessionCount : t.sidebar.emptyWorkspaceCount}
            </span>
            {!isUngrouped && !staticWebsiteOnly && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t.sidebar.newSessionInWorkspace}
                title={t.sidebar.newSessionInWorkspace}
                onClick={(e) => {
                  e.stopPropagation();
                  void router.push(`/workspace/chats/new?workspace=${node.workspaceId}`);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="hover:text-foreground text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <PlusIcon className="size-4" />
              </span>
            )}
            {!isUngrouped && !staticWebsiteOnly && (
              <WorkspaceHeaderMenu
                onRename={() =>
                  metaIndex >= 0 &&
                  openWorkspaceRename(
                    node.workspaceId!,
                    orderedGroupMeta[metaIndex]?.title ?? "",
                  )
                }
                onMoveUp={() => handleWorkspaceMove("up", node.workspaceId!)}
                onMoveDown={() => handleWorkspaceMove("down", node.workspaceId!)}
                onDelete={() => handleWorkspaceDelete(node.workspaceId!)}
                canUp={metaIndex > 0}
                canDown={metaIndex >= 0 && metaIndex < orderedGroupMeta.length - 1}
              />
            )}
          </span>
        </button>
      );
    },
    [
      toggleCollapse,
      handleWorkspaceDelete,
      handleWorkspaceMove,
      openWorkspaceRename,
      orderedGroupMeta,
      staticWebsiteOnly,
      t,
    ],
  );

  return (
    <>
      <SidebarGroup className="pt-1">
        <SidebarGroupLabel className="text-sm text-foreground font-medium">
          <span className="truncate">{t.sidebar.workspacesSection}</span>
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSearch}
              aria-label={t.sidebar.searchWorkspaces}
              title={t.sidebar.searchWorkspaces}
            >
              <Search className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={t.sidebar.sortBy}
                  title={t.sidebar.sortBy}
                >
                  <ArrowUpDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => changeSortMode("manual")}>
                  {sortMode === "manual" ? "✓ " : ""}
                  {t.sidebar.sortManual}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => changeSortMode("recent")}>
                  {sortMode === "recent" ? "✓ " : ""}
                  {t.sidebar.sortRecent}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void quickAddWorkspace()}
              aria-label={t.sidebar.addWorkspace}
              title={t.sidebar.addWorkspace}
            >
              <SquarePlus className="size-4" />
            </Button>
          </span>
        </SidebarGroupLabel>
        {(searchOpen || searchText) && (
          <SidebarGroupContent>
            <Input
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t.sidebar.searchWorkspaces}
              className="h-7 bg-muted/40 text-xs"
            />
          </SidebarGroupContent>
        )}
      </SidebarGroup>
      <SidebarGroup className="pt-1">
        <SidebarGroupContent className="group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">
          <SidebarMenu>
            <div className="flex w-full flex-col gap-1">
              {filteredGroupNodes.map((node) => (
                <div key={node.key} className="flex flex-col gap-0.5">
                  {renderGroupHeader(node)}
                  {node.expanded &&
                    node.sessions.map((session) => renderSessionRow(node, session))}
                </div>
              ))}
            </div>

            {archivedEntries.length > 0 && !staticWebsiteOnly && (
              <ArchivedSection entries={archivedEntries} onUnarchive={(id) => unarchiveThreadsMutate([id])} />
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Dialog (会话) */}
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
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleRenameSubmit}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog (工作区) */}
      <Dialog open={wsDialogOpen} onOpenChange={setWsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t.sidebar.renameWorkspace}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={wsDialogValue}
              onChange={(e) => setWsDialogValue(e.target.value)}
              placeholder={t.sidebar.renameWorkspace}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isIMEComposing(e)) {
                  e.preventDefault();
                  submitWorkspaceRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWsDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={submitWorkspaceRename}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function owningGroupKey(
  inputs: ReturnType<typeof buildSidebarInputs>,
  threadId: string,
): string | undefined {
  return inputs.groups.find((g) => g.threadIds.includes(threadId))?.id;
}

/** 折叠桥已并入顶部 useWorkspaceViewCollapse 直连调用。 */

function WorkspaceHeaderMenu({
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
  canUp,
  canDown,
}: {
  onRename: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="hover:text-foreground text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="text-blue-500" />
          <span>{t.sidebar.renameWorkspace}</span>
        </DropdownMenuItem>
        {canUp && (
          <DropdownMenuItem onSelect={onMoveUp}>
            <ChevronRight className="-rotate-90 text-muted-foreground" />
            <span>{t.sidebar.moveUpItem}</span>
          </DropdownMenuItem>
        )}
        {canDown && (
          <DropdownMenuItem onSelect={onMoveDown}>
            <ChevronRight className="rotate-90 text-muted-foreground" />
            <span>{t.sidebar.moveDownItem}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete}>
          <Trash2 className="text-rose-500" />
          <span>{t.sidebar.deleteWorkspaceAction}</span>
          <span className="text-muted-foreground ml-auto max-w-40 truncate text-[10px] normal-case">
            {t.sidebar.deleteWorkspaceHint}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ArchivedSection({
  entries,
  onUnarchive,
}: {
  entries: ReadonlyArray<{ id: string; title: string }>;
  onUnarchive: (id: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-2 py-1 text-[11px] tracking-wide uppercase"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>
          {t.sidebar.archivedSection} ({entries.length})
        </span>
      </button>
      {open &&
        entries.map((entry) => (
          <div
            key={entry.id}
            className="text-muted-foreground flex items-center justify-between gap-2 px-3 py-1 text-xs"
          >
            <span className="truncate opacity-70">{entry.title}</span>
            <button
              type="button"
              className="hover:text-foreground flex shrink-0 items-center gap-1"
              onClick={() => onUnarchive(entry.id)}
            >
              <ArchiveRestore className="size-3" />
              <span>{t.sidebar.unarchiveThread}</span>
            </button>
          </div>
        ))}
    </div>
  );
}
