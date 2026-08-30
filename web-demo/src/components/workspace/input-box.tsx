"use client";

import type { ChatStatus } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  GraduationCapIcon,
  LightbulbIcon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  RocketIcon,
  ShieldIcon,
  SquareIcon,
  ZapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ReasoningEffort } from "@/core/agents/types";
import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";
import type { Translations } from "@/core/i18n/locales/types";
import { useModels } from "@/core/models/hooks";
import type { AgentThreadContext } from "@/core/threads";
import type { QueuedMessage } from "@/core/threads/queue-store";
import { textOfMessage } from "@/core/threads/utils";
import {
  useWorkspaceTree,
  useCreateWorkspace,
  usePickDirectory,
} from "@/core/workspaces/hooks";
import { useWorkspaceParamPreset } from "@/core/workspaces/use-workspace-param";
import { cn } from "@/lib/utils";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "../ai-elements/model-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import { useThread } from "./messages/context";
import { QueuedMessagesBar } from "./queued-messages-bar";
import { SlashCommandMenu } from "./slash-command-menu";
import { Tooltip } from "./tooltip";

function getResolvedEffort(
  effort: ReasoningEffort | undefined,
  supportsThinking: boolean,
): ReasoningEffort {
  if (!supportsThinking && effort !== "minimal") {
    return "minimal";
  }
  if (effort) {
    return effort;
  }
  return supportsThinking ? "medium" : "minimal";
}

// 推理深度档位即原模式档位（minimal→闪速 / low→思考 / medium→Pro / high→Ultra），
// 保留各档位的图标与金色高亮视觉。
const EFFORT_ICONS: Record<ReasoningEffort, LucideIcon> = {
  minimal: ZapIcon,
  low: LightbulbIcon,
  medium: GraduationCapIcon,
  high: RocketIcon,
};

function getEffortLabelKey(
  effort: ReasoningEffort,
): keyof Pick<
  Translations["inputBox"],
  | "reasoningEffortMinimal"
  | "reasoningEffortLow"
  | "reasoningEffortMedium"
  | "reasoningEffortHigh"
> {
  switch (effort) {
    case "minimal":
      return "reasoningEffortMinimal";
    case "low":
      return "reasoningEffortLow";
    case "medium":
      return "reasoningEffortMedium";
    case "high":
      return "reasoningEffortHigh";
  }
}

function getEffortDescriptionKey(
  effort: ReasoningEffort,
): keyof Pick<
  Translations["inputBox"],
  | "reasoningEffortMinimalDescription"
  | "reasoningEffortLowDescription"
  | "reasoningEffortMediumDescription"
  | "reasoningEffortHighDescription"
> {
  switch (effort) {
    case "minimal":
      return "reasoningEffortMinimalDescription";
    case "low":
      return "reasoningEffortLowDescription";
    case "medium":
      return "reasoningEffortMediumDescription";
    case "high":
      return "reasoningEffortHighDescription";
  }
}

function EffortIcon({
  effort,
  className,
}: {
  effort: ReasoningEffort;
  className?: string;
}) {
  const Icon = EFFORT_ICONS[effort];
  return (
    <Icon className={cn(className, effort === "high" && "text-[#dabb5e]")} />
  );
}

export function InputBox({
  className,
  disabled,
  autoFocus,
  status = "ready",
  context,
  isNewThread,
  threadId,
  initialValue,
  onContextChange,
  onFollowupsVisibilityChange,
  onSubmit,
  onStop,
  onEnqueue,
  queuedMessages,
  onInjectFromQueue,
  onRemoveFromQueue,
  onEditQueued,
  onRetryQueued,
  onReorderQueued,
  onSendAllQueued,
  ...props
}: Omit<ComponentProps<typeof PromptInput>, "onSubmit"> & {
  assistantId?: string | null;
  status?: ChatStatus;
  disabled?: boolean;
  context: Omit<
    AgentThreadContext,
    "thread_id" | "is_plan_mode" | "thinking_enabled" | "subagent_enabled"
  > & {
    reasoning_effort?: ReasoningEffort;
  };
  isNewThread?: boolean;
  threadId: string;
  initialValue?: string;
  onContextChange?: (
    context: Omit<
      AgentThreadContext,
      "thread_id" | "is_plan_mode" | "thinking_enabled" | "subagent_enabled"
    > & {
      reasoning_effort?: ReasoningEffort;
    },
  ) => void;
  onFollowupsVisibilityChange?: (visible: boolean) => void;
  onSubmit?: (message: PromptInputMessage) => void;
  onStop?: () => void;
  onEnqueue?: (message: PromptInputMessage) => void;
  // ── 队列 props（Task 16） ──────────────────────────────────────────
  queuedMessages?: QueuedMessage[];
  onInjectFromQueue?: (msg: QueuedMessage) => void;
  onRemoveFromQueue?: (id: string) => void;
  onEditQueued?: (id: string, content: string) => void;
  onRetryQueued?: (msg: QueuedMessage) => void;
  onReorderQueued?: (id: string, direction: "up" | "down") => void;
  onSendAllQueued?: () => void;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const { models } = useModels();
  const { thread, isMock } = useThread();
  const { textInput } = usePromptInputController();

  // ── 工作区选择器（新任务，DSH 截图二） ──────────────────────────
  const { data: workspaceTree } = useWorkspaceTree();
  const { mutateAsync: createWorkspaceMutate } = useCreateWorkspace();
  const { mutateAsync: pickDirectoryMutate } = usePickDirectory();
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [confirmFullAccess, setConfirmFullAccess] = useState(false);
  const workspaces = useMemo(() => workspaceTree?.workspaces ?? [], [workspaceTree]);
  const selectedWsId = context?.workspace_id;

  const pickWorkspace = useCallback(
    (id: string | undefined) => {
      onContextChange?.({
        ...context,
        workspace_id: id,
        user_workspace_path: id
          ? (workspaces.find((w) => w.id === id)?.path ?? context?.user_workspace_path)
          : undefined,
      } as Parameters<typeof onContextChange>[0]);
    },
    [context, onContextChange, workspaces],
  );

  const currentSandboxMode = (
    context?.sandbox_mode === "read-only" ||
    context?.sandbox_mode === "workspace-write" ||
    context?.sandbox_mode === "danger-full-access"
  )
    ? context.sandbox_mode
    : "workspace-write";

  const applySandboxMode = useCallback(
    (mode: string) => {
      onContextChange?.({
        ...context,
        sandbox_mode: mode,
      } as Parameters<typeof onContextChange>[0]);
    },
    [context, onContextChange],
  );

  // 「完全访问」是危险档：切到它之前先弹确认对话框，用户确认后才真正应用。
  // 其余档（只读/工作区可写）直接生效。
  const selectSandboxMode = useCallback(
    (mode: string) => {
      if (mode === "danger-full-access" && currentSandboxMode !== "danger-full-access") {
        setConfirmFullAccess(true);
        return;
      }
      applySandboxMode(mode);
    },
    [applySandboxMode, currentSandboxMode],
  );

  // 添加工作区一步到位：菜单项点击 → 系统目录选择器 → 直接创建并选中。
  // 组头「+ 新会话」跳转 /workspace/chats/new?workspace=<id>：在草稿态把该
  // 工作区预置进 context（与下拉选择同一条数据通路）。URL 参数代表明确的
  // 新建意图，必须覆盖全局遗留的「上一个任务工作区」默认值；同一草稿内
  // 只生效一次，之后手动切换不被回抢（语义见 use-workspace-param.ts）。
  const workspaceParam = searchParams.get("workspace");
  useWorkspaceParamPreset({
    workspaceParam,
    isNewThread: isNewThread ?? false,
    threadId,
    workspaces,
    onApply: (patch) => {
      onContextChange?.(patch as Parameters<typeof onContextChange>[0]);
    },
  });

  const quickAddWorkspace = useCallback(async () => {
    try {
      const path = await pickDirectoryMutate();
      if (!path) return;
      const created = await createWorkspaceMutate({ path });
      pickWorkspace(created.id);
    } catch (error) {
      console.error("create workspace failed", error);
    }
  }, [createWorkspaceMutate, pickDirectoryMutate, pickWorkspace]);
  const hasText = (textInput.value ?? "").trim().length > 0;
  const promptRootRef = useRef<HTMLDivElement | null>(null);

  const [followups, setFollowups] = useState<string[]>([]);
  const [followupsHidden, setFollowupsHidden] = useState(false);
  const [followupsLoading, setFollowupsLoading] = useState(false);
  const lastGeneratedForAiIdRef = useRef<string | null>(null);
  const wasStreamingRef = useRef(false);
  const messagesRef = useRef(thread.messages);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (models.length === 0) {
      return;
    }
    const currentModel = models.find((m) => m.name === context.model_name);
    const fallbackModel = currentModel ?? models[0]!;
    const supportsThinking = fallbackModel.supports_thinking ?? false;
    const nextModelName = fallbackModel.name;
    const nextEffort = getResolvedEffort(
      context.reasoning_effort,
      supportsThinking,
    );

    if (
      context.model_name === nextModelName &&
      context.reasoning_effort === nextEffort
    ) {
      return;
    }

    onContextChange?.({
      ...context,
      model_name: nextModelName,
      reasoning_effort: nextEffort,
    });
  }, [context, models, onContextChange]);

  const selectedModel = useMemo(() => {
    if (models.length === 0) {
      return undefined;
    }
    return models.find((m) => m.name === context.model_name) ?? models[0];
  }, [context.model_name, models]);

  const resolvedModelName = selectedModel?.name;

  // 当前生效档位：未显式选择时按模型能力回落默认（支持思考→中档，否则最低档）
  const currentEffort = useMemo(
    () =>
      getResolvedEffort(
        context.reasoning_effort,
        selectedModel?.supports_thinking ?? false,
      ),
    [context.reasoning_effort, selectedModel],
  );

  const handleModelSelect = useCallback(
    (model_name: string) => {
      const model = models.find((m) => m.name === model_name);
      if (!model) {
        return;
      }
      onContextChange?.({
        ...context,
        model_name,
        reasoning_effort: getResolvedEffort(
          context.reasoning_effort,
          model.supports_thinking ?? false,
        ),
      });
      setModelDialogOpen(false);
    },
    [onContextChange, context, models],
  );

  const handleReasoningEffortSelect = useCallback(
    (effort: ReasoningEffort) => {
      onContextChange?.({
        ...context,
        reasoning_effort: effort,
      });
    },
    [onContextChange, context],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (status === "streaming") {
        if (!message.text?.trim()) return;
        onEnqueue?.(message);
        return;
      }
      if (!message.text) {
        return;
      }
      setFollowups([]);
      setFollowupsHidden(false);
      setFollowupsLoading(false);

      // Guard against submitting before the initial model auto-selection
      // effect has flushed thread settings to storage/state.
      if (resolvedModelName && context.model_name !== resolvedModelName) {
        onContextChange?.({
          ...context,
          model_name: resolvedModelName,
          reasoning_effort: getResolvedEffort(
            context.reasoning_effort,
            selectedModel?.supports_thinking ?? false,
          ),
        });
        setTimeout(() => onSubmit?.(message), 0);
        return;
      }

      onSubmit?.(message);
    },
    [
      context,
      onContextChange,
      onEnqueue,
      onSubmit,
      resolvedModelName,
      selectedModel?.supports_thinking,
      status,
    ],
  );

  const requestFormSubmit = useCallback(() => {
    const form = promptRootRef.current?.querySelector("form");
    form?.requestSubmit();
  }, []);

  const handleFollowupClick = useCallback(
    (suggestion: string) => {
      if (status === "streaming") {
        onEnqueue?.({ text: suggestion, files: [] });
        return;
      }
      const current = (textInput.value ?? "").trim();
      if (current) {
        setPendingSuggestion(suggestion);
        setConfirmOpen(true);
        return;
      }
      textInput.setInput(suggestion);
      setFollowupsHidden(true);
      setTimeout(() => requestFormSubmit(), 0);
    },
    [onEnqueue, requestFormSubmit, status, textInput],
  );

  const confirmReplaceAndSend = useCallback(() => {
    if (!pendingSuggestion) {
      setConfirmOpen(false);
      return;
    }
    textInput.setInput(pendingSuggestion);
    setFollowupsHidden(true);
    setConfirmOpen(false);
    setPendingSuggestion(null);
    setTimeout(() => requestFormSubmit(), 0);
  }, [pendingSuggestion, requestFormSubmit, textInput]);

  const confirmAppendAndSend = useCallback(() => {
    if (!pendingSuggestion) {
      setConfirmOpen(false);
      return;
    }
    const current = (textInput.value ?? "").trim();
    const next = current
      ? `${current}\n${pendingSuggestion}`
      : pendingSuggestion;
    textInput.setInput(next);
    setFollowupsHidden(true);
    setConfirmOpen(false);
    setPendingSuggestion(null);
    setTimeout(() => requestFormSubmit(), 0);
  }, [pendingSuggestion, requestFormSubmit, textInput]);

  const showFollowups =
    !disabled &&
    !isNewThread &&
    !followupsHidden &&
    (followupsLoading || followups.length > 0);

  const followupsVisibilityChangeRef = useRef(onFollowupsVisibilityChange);

  useEffect(() => {
    followupsVisibilityChangeRef.current = onFollowupsVisibilityChange;
  }, [onFollowupsVisibilityChange]);

  useEffect(() => {
    followupsVisibilityChangeRef.current?.(showFollowups);
  }, [showFollowups]);

  useEffect(() => {
    messagesRef.current = thread.messages;
  }, [thread.messages]);

  useEffect(() => {
    return () => followupsVisibilityChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    const streaming = status === "streaming";
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming;
    if (!wasStreaming || streaming) {
      return;
    }

    if (disabled || isMock) {
      return;
    }

    const lastAi = [...messagesRef.current]
      .reverse()
      .find((m) => m.type === "ai");
    const lastAiId = lastAi?.id ?? null;
    if (!lastAiId || lastAiId === lastGeneratedForAiIdRef.current) {
      return;
    }
    lastGeneratedForAiIdRef.current = lastAiId;

    const recent = messagesRef.current
      .filter((m) => m.type === "human" || m.type === "ai")
      .map((m) => {
        const role = m.type === "human" ? "user" : "assistant";
        const content = textOfMessage(m) ?? "";
        return { role, content };
      })
      .filter((m) => m.content.trim().length > 0)
      .slice(-6);

    if (recent.length === 0) {
      return;
    }

    const controller = new AbortController();
    setFollowupsHidden(false);
    setFollowupsLoading(true);
    setFollowups([]);

    fetch(`${getBackendBaseURL()}/api/threads/${threadId}/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: recent,
        n: 3,
        model_name: context.model_name ?? undefined,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          return { suggestions: [] as string[] };
        }
        return (await res.json()) as { suggestions?: string[] };
      })
      .then((data) => {
        const suggestions = (data.suggestions ?? [])
          .map((s) => (typeof s === "string" ? s.trim() : ""))
          .filter((s) => s.length > 0)
          .slice(0, 5);
        setFollowups(suggestions);
      })
      .catch(() => {
        setFollowups([]);
      })
      .finally(() => {
        setFollowupsLoading(false);
      });

    return () => controller.abort();
  }, [context.model_name, disabled, isMock, status, threadId]);

  // Sync follow-ups state to context so the panel (rendered at the end of
  // MessageList) can display the data without floating over the input area.
  // NOTE: depend only on the stable setters (from useState/useCallback), not
  // on the whole context object — otherwise the effect re-runs every time the
  // Provider's value identity changes, calling setData again and looping.
  return (
    <div ref={promptRootRef} className="relative flex flex-col gap-4">
      <SlashCommandMenu rootRef={promptRootRef} />
      {queuedMessages && queuedMessages.length > 0 && (
        <QueuedMessagesBar
          messages={queuedMessages}
          isStreaming={status === "streaming"}
          // 回调缺省值用表达式体（() => undefined），避免触发
          // no-empty-function；实际渲染时页面总会传入真实回调。
          onInject={onInjectFromQueue ?? (() => undefined)}
          onRemove={onRemoveFromQueue ?? (() => undefined)}
          onEdit={onEditQueued ?? (() => undefined)}
          onRetry={onRetryQueued ?? (() => undefined)}
          onReorder={onReorderQueued ?? (() => undefined)}
          onSendAll={onSendAllQueued ?? (() => undefined)}
        />
      )}
      {isNewThread && (
        <div className="flex w-full items-center gap-2 px-1">
          <DropdownMenu open={wsMenuOpen} onOpenChange={setWsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-foreground/90 h-7 rounded-full px-3"
                title={t.inputBox.pickWorkspace}
              >
                <FolderIcon className="size-3.5" />
                <span className="max-w-40 truncate text-xs font-normal">
                  {(context?.workspace_id
                    ? workspaces.find((w) => w.id === context.workspace_id)?.title
                    : undefined) ?? t.inputBox.ungroupedOption}
                </span>
                <ChevronDownIcon className="text-muted-foreground size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onSelect={() => pickWorkspace(w.id)}>
                  <FolderIcon className="text-muted-foreground size-3.5" />
                  <span className="truncate">{w.title}</span>
                  {context?.workspace_id === w.id && (
                    <CheckIcon className="ml-auto size-4" />
                  )}
                  {context?.workspace_id !== w.id && (
                    <div className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => pickWorkspace(undefined)}>
                <span className="truncate">{t.inputBox.ungroupedOption}</span>
                {!context?.workspace_id && <CheckIcon className="ml-auto size-4" />}
                {!context?.workspace_id && <div className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void quickAddWorkspace()}>
                <PlusIcon className="size-3.5" />
                <span>{t.inputBox.addWorkspace}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <PromptInput
        className={cn(
          "bg-background/85 rounded-2xl backdrop-blur-sm transition-all duration-300 ease-out *:data-[slot='input-group']:rounded-2xl",
          className,
        )}
        disabled={disabled}
        globalDrop
        multiple
        onSubmit={handleSubmit}
        {...props}
      >
        <PromptInputAttachments>
          {(attachment) => <PromptInputAttachment data={attachment} />}
        </PromptInputAttachments>
        <PromptInputBody className="absolute top-0 right-0 left-0 z-3">
          <PromptInputTextarea
            className={cn("size-full")}
            disabled={disabled}
            placeholder={t.inputBox.placeholder}
            autoFocus={autoFocus}
            defaultValue={initialValue}
          />
        </PromptInputBody>
        <PromptInputFooter className="flex">
          <PromptInputTools>
            {/* TODO: Add more connectors here
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger className="px-2!" />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments
                label={t.inputBox.addAttachments}
              />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu> */}
            <AddAttachmentsButton className="px-2!" />
            {/* 访问模式（DSH access-mode 对齐）：左下角三档沙箱策略 */}
            <DropdownMenu open={accessMenuOpen} onOpenChange={setAccessMenuOpen}>
              <DropdownMenuTrigger asChild>
                <PromptInputButton
                  title={`${t.inputBox.accessMode}: ${t.inputBox[
                    currentSandboxMode === "read-only"
                      ? "sandboxReadOnly"
                      : currentSandboxMode === "danger-full-access"
                        ? "sandboxFullAccess"
                        : "sandboxWorkspaceWrite"
                  ]}`}
                >
                  <ShieldIcon className="size-3.5" />
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    {t.inputBox.accessMode}
                  </span>
                  <span className="text-xs font-medium">
                    {t.inputBox[
                      currentSandboxMode === "read-only"
                        ? "sandboxReadOnly"
                        : currentSandboxMode === "danger-full-access"
                          ? "sandboxFullAccess"
                          : "sandboxWorkspaceWrite"
                    ]}
                  </span>
                </PromptInputButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  {t.inputBox.accessMode}
                </DropdownMenuLabel>
                {(
                  [
                    ["read-only", "sandboxReadOnly"],
                    ["workspace-write", "sandboxWorkspaceWrite"],
                    ["danger-full-access", "sandboxFullAccess"],
                  ] as const
                ).map(([value, labelKey]) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => selectSandboxMode(value)}
                    className={cn(
                      currentSandboxMode === value
                        ? "text-accent-foreground"
                        : "text-muted-foreground/65",
                    )}
                  >
                    {t.inputBox[labelKey]}
                    {currentSandboxMode === value && (
                      <CheckIcon className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <PromptInputActionMenu>
              <Tooltip
                content={`${t.inputBox.reasoningEffort}: ${t.inputBox[getEffortLabelKey(currentEffort)]} - ${t.inputBox[getEffortDescriptionKey(currentEffort)]}`}
              >
                <PromptInputActionMenuTrigger className="gap-1.5! px-2!">
                  <EffortIcon effort={currentEffort} className="size-3" />
                  <span className="text-muted-foreground text-xs">
                    {t.inputBox.reasoningEffort}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      currentEffort === "high" ? "golden-text" : "text-foreground",
                    )}
                  >
                    {t.inputBox[getEffortLabelKey(currentEffort)]}
                  </span>
                </PromptInputActionMenuTrigger>
              </Tooltip>
              <PromptInputActionMenuContent className="w-70">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    {t.inputBox.reasoningEffort}
                  </DropdownMenuLabel>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuItem
                      className={cn(
                        currentEffort === "minimal"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("minimal")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          <ZapIcon
                            className={cn(
                              "mr-2 size-4",
                              currentEffort === "minimal" &&
                                "text-accent-foreground",
                            )}
                          />
                          {t.inputBox.reasoningEffortMinimal}
                        </div>
                        <div className="pl-7 text-xs">
                          {t.inputBox.reasoningEffortMinimalDescription}
                        </div>
                      </div>
                      {currentEffort === "minimal" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      className={cn(
                        currentEffort === "low"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("low")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          <LightbulbIcon
                            className={cn(
                              "mr-2 size-4",
                              currentEffort === "low" &&
                                "text-accent-foreground",
                            )}
                          />
                          {t.inputBox.reasoningEffortLow}
                        </div>
                        <div className="pl-7 text-xs">
                          {t.inputBox.reasoningEffortLowDescription}
                        </div>
                      </div>
                      {currentEffort === "low" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      className={cn(
                        currentEffort === "medium"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("medium")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          <GraduationCapIcon
                            className={cn(
                              "mr-2 size-4",
                              currentEffort === "medium" &&
                                "text-accent-foreground",
                            )}
                          />
                          {t.inputBox.reasoningEffortMedium}
                        </div>
                        <div className="pl-7 text-xs">
                          {t.inputBox.reasoningEffortMediumDescription}
                        </div>
                      </div>
                      {currentEffort === "medium" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      className={cn(
                        currentEffort === "high"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("high")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          <RocketIcon
                            className={cn(
                              "mr-2 size-4",
                              currentEffort === "high" && "text-[#dabb5e]",
                            )}
                          />
                          <div
                            className={cn(
                              currentEffort === "high" && "golden-text",
                            )}
                          >
                            {t.inputBox.reasoningEffortHigh}
                          </div>
                        </div>
                        <div className="pl-7 text-xs">
                          {t.inputBox.reasoningEffortHighDescription}
                        </div>
                      </div>
                      {currentEffort === "high" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                  </PromptInputActionMenu>
                </DropdownMenuGroup>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          <PromptInputTools>

            <ModelSelector
              open={modelDialogOpen}
              onOpenChange={setModelDialogOpen}
            >
              <ModelSelectorTrigger asChild>
                <PromptInputButton>
                  <div className="flex min-w-0 flex-col items-start text-left">
                    <ModelSelectorName className="text-xs font-normal">
                      {selectedModel?.display_name}
                    </ModelSelectorName>
                  </div>
                </PromptInputButton>
              </ModelSelectorTrigger>
              <ModelSelectorContent>
                <ModelSelectorInput placeholder={t.inputBox.searchModels} />
                <ModelSelectorList>
                  {models.map((m) => (
                    <ModelSelectorItem
                      key={m.name}
                      value={m.name}
                      onSelect={() => handleModelSelect(m.name)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <ModelSelectorName>{m.display_name}</ModelSelectorName>
                        <span className="text-muted-foreground truncate text-[10px]">
                          {m.model}
                        </span>
                      </div>
                      {m.name === context.model_name ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </ModelSelectorItem>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
            {status === "streaming" && (!hasText || !onEnqueue) ? (
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => onStop?.()}
                aria-label="停止当前任务"
                title="停止当前任务"
              >
                <SquareIcon className="size-4" />
              </Button>
            ) : (
              <PromptInputSubmit
                className="rounded-full"
                disabled={disabled}
                variant="outline"
                status={status}
                title={
                  status === "streaming"
                    ? "加入待发送队列（任务执行中）"
                    : undefined
                }
              />
            )}
          </PromptInputTools>
        </PromptInputFooter>
        {!isNewThread && (
          <div className="bg-background absolute right-0 -bottom-[17px] left-0 z-0 h-4"></div>
        )}
      </PromptInput>

      {/* 完全访问（danger-full-access）确认对话框：用户确认后才切换 */}
      <Dialog open={confirmFullAccess} onOpenChange={setConfirmFullAccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inputBox.sandboxFullAccessConfirmTitle}</DialogTitle>
            <DialogDescription>
              {t.inputBox.sandboxFullAccessConfirmDesc}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmFullAccess(false)}
            >
              {t.inputBox.sandboxFullAccessCancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                applySandboxMode("danger-full-access");
                setConfirmFullAccess(false);
              }}
            >
              {t.inputBox.sandboxFullAccessConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Per-suggestion color theme and SuggestionList moved to chats/suggestion-list.tsx */

function AddAttachmentsButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const attachments = usePromptInputAttachments();
  return (
    <Tooltip content={t.inputBox.addAttachments}>
      <PromptInputButton
        className={cn("px-2!", className)}
        onClick={() => attachments.openFileDialog()}
      >
        <PaperclipIcon className="size-3" />
      </PromptInputButton>
    </Tooltip>
  );
}
