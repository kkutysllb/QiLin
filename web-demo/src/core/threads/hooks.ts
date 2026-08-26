import type { Message, Run } from "@langchain/langgraph-sdk";
import type { ThreadsClient } from "@langchain/langgraph-sdk/client";
import { useStream } from "@langchain/langgraph-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

import { getAPIClient } from "../api";
import { fetch } from "../api/fetcher";
import { getBackendBaseURL, isDesktop } from "../config";
import { useI18n } from "../i18n/hooks";
import { isHiddenFromUIMessage, type FileInMessage } from "../messages/utils";
import type { LocalSettings } from "../settings";
import { useSubtaskContext, useUpdateSubtask } from "../tasks/context";
import type { UploadedFileInfo } from "../uploads";
import { promptInputFilePartToFile, uploadFiles } from "../uploads";

import {
  getThreadRuntimeSnapshot,
  publishThreadRuntimeSnapshot,
  useThreadRuntimeSnapshot,
} from "./runtime-store";
import { handleStreamEvent } from "./stream-event-handler";
import {
  getCachedThreadState,
  setCachedThreadState,
} from "./thread-state-store";
import type { AgentThread, AgentThreadState, RunMessage } from "./types";

export type ToolEndEvent = {
  name: string;
  data: unknown;
};

export type ThreadStreamOptions = {
  threadId?: string | null | undefined;
  context: LocalSettings["context"];
  isMock?: boolean;
  /** LangGraph assistant/graph id to run. Defaults to ``"lead_agent"``. */
  assistantId?: string;
  onSend?: (threadId: string) => void;
  onStart?: (threadId: string, runId: string) => void;
  onFinish?: (state: AgentThreadState) => void;
  onToolEnd?: (event: ToolEndEvent) => void;
};

type SendMessageOptions = {
  additionalKwargs?: Record<string, unknown>;
};

type DisplayThreadState = {
  messages: Message[];
  values: AgentThreadState;
  isLoading: boolean;
  error: unknown;
};

type StoppableThread<T> = T & {
  stop?: (...args: never[]) => unknown;
};

function mergeMessages(
  historyMessages: Message[],
  threadMessages: Message[],
  optimisticMessages: Message[],
): Message[] {
  const threadMessageIds = new Set(
    threadMessages
      .map((m) => ("tool_call_id" in m ? m.tool_call_id : m.id))
      .filter(Boolean),
  );

  // The overlap is a contiguous suffix of historyMessages (newest history == oldest thread).
  // Scan from the end: shrink cutoff while messages are already in thread, stop as soon as
  // we hit one that isn't — everything before that point is non-overlapping.
  let cutoff = historyMessages.length;
  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msg = historyMessages[i];
    if (!msg) {
      continue;
    }
    if (
      (msg?.id && threadMessageIds.has(msg.id)) ||
      ("tool_call_id" in msg && threadMessageIds.has(msg.tool_call_id))
    ) {
      cutoff = i;
    } else {
      break;
    }
  }

  return [
    ...historyMessages.slice(0, cutoff),
    ...threadMessages,
    ...optimisticMessages,
  ];
}

function getStreamErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    const detail = Reflect.get(error, "detail");
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    const nestedError = Reflect.get(error, "error");
    if (nestedError instanceof Error && nestedError.message.trim()) {
      return nestedError.message;
    }
    if (typeof nestedError === "string" && nestedError.trim()) {
      return nestedError;
    }
  }
  return "Request failed.";
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const wrapped = new Error(getStreamErrorMessage(error));
  if (typeof error === "object" && error !== null) {
    Object.assign(wrapped, error);
  }
  return wrapped;
}

/**
 * Detect a 409 Conflict from the backend, raised when a thread already has
 * an active run and a new run was created with the default "reject"
 * multitask strategy. This commonly happens when the page unmounts
 * (dropping the SSE connection) but `onDisconnect:"continue"` keeps the
 * run alive, so resuming the conversation collides with the orphaned run.
 * Detected in `sendMessage` to retry with the "interrupt" strategy instead
 * of leaving the user stuck until the backend is restarted.
 */
function isThreadBusyConflict(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }
  const status = Reflect.get(error, "status");
  if (status === 409 || status === "409") {
    return true;
  }
  const message = Reflect.get(error, "message");
  if (
    typeof message === "string" &&
    /409|conflict|already running/i.test(message)
  ) {
    return true;
  }
  const detail = Reflect.get(error, "detail");
  if (typeof detail === "string" && /already running|conflict/i.test(detail)) {
    return true;
  }
  return false;
}

function isStaleStreamJoinError(error: unknown): boolean {
  if (error == null) {
    return false;
  }

  const parts: string[] = [];
  if (typeof error === "string") {
    parts.push(error);
  } else if (error instanceof Error) {
    parts.push(error.message);
  } else if (typeof error === "object") {
    const message = Reflect.get(error, "message");
    const detail = Reflect.get(error, "detail");
    const nestedError = Reflect.get(error, "error");
    if (typeof message === "string") parts.push(message);
    if (typeof detail === "string") parts.push(detail);
    if (nestedError instanceof Error) parts.push(nestedError.message);
    if (typeof nestedError === "string") parts.push(nestedError);
  }

  const text = parts.join(" ");
  return (
    /not active on this worker/i.test(text) &&
    /cannot be streamed/i.test(text)
  );
}

function clearStoredStreamReconnectKey(threadId: string | null | undefined) {
  if (!threadId || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(`lg:stream:${threadId}`);
  } catch {
    // ignore storage failures
  }
}

function isActiveRun(run: Run): boolean {
  return run.status === "running" || run.status === "pending";
}

export function useThreadStream({
  threadId,
  context,
  isMock,
  assistantId = "lead_agent",
  onSend,
  onStart,
  onFinish,
  onToolEnd,
}: ThreadStreamOptions) {
  const { t } = useI18n();
  const runtimeSnapshot = useThreadRuntimeSnapshot(threadId);
  // ── Cross-mount state restoration ───────────────────────────────
  // On component remount, `useStream` reinitialises with empty messages
  // and `isLoading=false`. The user would see a flash of empty content +
  // ready→streaming state toggle before the stream reconnects. We bridge
  // that gap with a module-level cache of the last displayed state so the
  // remounted component renders the previous messages immediately while
  // the SSE reconnects silently in the background.
  const restoredStateRef = useRef<DisplayThreadState | null | undefined>(
    undefined,
  );
  const restoredThreadIdRef = useRef<string | null | undefined>(undefined);
  const normalizedRestoredThreadId = threadId ?? null;
  if (restoredThreadIdRef.current !== normalizedRestoredThreadId) {
    restoredThreadIdRef.current = normalizedRestoredThreadId;
    if (!normalizedRestoredThreadId) {
      restoredStateRef.current = null;
    } else {
      const runtimeState = getThreadRuntimeSnapshot(normalizedRestoredThreadId);
      restoredStateRef.current =
        runtimeState ??
        getCachedThreadState(normalizedRestoredThreadId) ??
        null;
    }
  }
  // Track the thread ID that is currently streaming to handle thread changes during streaming
  const [onStreamThreadId, setOnStreamThreadId] = useState(() => threadId);
  // Ref to track current thread ID across async callbacks without causing re-renders,
  // and to allow access to the current thread id in onUpdateEvent
  const threadIdRef = useRef<string | null>(threadId ?? null);
  const startedRef = useRef(false);
  // ── Queue auto-send integration (Task 16) ─────────────────────────
  // stopFlagRef: set true by stopThread() so onFinish knows the run was
  //   manually stopped (skip queue auto-send). Reset after each finish.
  // currentRunIdRef: the active run_id, captured from onCreated meta so the
  //   queue coordinator can inject messages into the live run.
  // autoSendTriggerRef: callback registered by the page; invoked (deferred)
  //   when the run completes normally (not stopped).
  //
  // pendingAutoSendRef: set true by onFinish when the run ended normally.
  //   The actual autoSendNext dispatch happens in a layout effect watching
  //   thread.isLoading — NOT inside onFinish itself. onFinish runs inside
  //   useStream's callback where thread.messages may not yet reflect the
  //   final state; calling sendMessage there captured a stale prevMsgCountRef,
  //   racing the optimistic-message cleanup and producing duplicate bubbles.
  //   Deferring to the effect ensures thread.messages is settled first.
  const stopFlagRef = useRef(false);
  // ⚠ currentRunId 用 state 而非 ref：onCreated 设置 run_id 后必须触发重渲染，
  // 否则消费方（useQueueCoordinator.injectNow）拿到的 currentRunId 仍是旧值（null），
  // 导致 "if (!currentRunId) return" 静默跳过，立即注入失效（打包后尤其明显，
  // dev 模式靠 Fast Refresh/额外状态更新碰巧刷新）。
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const autoSendTriggerRef = useRef<(() => Promise<void>) | null>(null);
  const pendingAutoSendRef = useRef(false);
  const listeners = useRef({
    onSend,
    onStart,
    onFinish,
    onToolEnd,
  });

  const {
    messages: history,
    hasMore: hasMoreHistory,
    loadMore: loadMoreHistory,
    loading: isHistoryLoading,
    appendMessages,
  } = useThreadHistory(onStreamThreadId ?? "", {
    deferInitialLoad: (restoredStateRef.current?.messages.length ?? 0) > 0,
  });

  // Keep listeners ref updated with latest callbacks
  useEffect(() => {
    listeners.current = { onSend, onStart, onFinish, onToolEnd };
  }, [onSend, onStart, onFinish, onToolEnd]);

  useEffect(() => {
    const normalizedThreadId = threadId ?? null;
    if (!normalizedThreadId) {
      // Reset when the UI moves back to a brand new unsaved thread.
      startedRef.current = false;
      setOnStreamThreadId(normalizedThreadId);
    } else {
      setOnStreamThreadId(normalizedThreadId);
    }
    threadIdRef.current = normalizedThreadId;
  }, [threadId]);

  const handleStreamStart = useCallback((_threadId: string, _runId: string) => {
    threadIdRef.current = _threadId;
    // Track the active run_id for queue injection + reset the stop flag so a
    // fresh run is treated as "not manually stopped" until stopThread() fires.
    // 同步更新 ref（供回调内同步读取）与 state（触发重渲染让 coordinator 拿到新值）。
    if (_runId) {
      currentRunIdRef.current = _runId;
      setCurrentRunId(_runId);
    }
    stopFlagRef.current = false;
    if (!startedRef.current) {
      listeners.current.onStart?.(_threadId, _runId);
      startedRef.current = true;
    }
    setOnStreamThreadId(_threadId);
  }, []);

  const queryClient = useQueryClient();
  const updateSubtask = useUpdateSubtask();
  const { tasks: subtasks, setTasks: setSubtasks } = useSubtaskContext();

  const thread = useStream<AgentThreadState>({
    client: getAPIClient(isMock),
    assistantId,
    threadId: onStreamThreadId,
    // SDK calls onThreadId immediately after client.threads.create()
    // succeeds — BEFORE runs.stream() and thus before onCreated.  This is
    // the most reliable notification of a new thread ID.  We call
    // handleStreamStart here so onStart fires and setOnStreamThreadId
    // updates even if the onCreated callback (which depends on the
    // onRunCreated SSE event from the server) is delayed or lost.
    onThreadId: (newThreadId: string) => {
      handleStreamStart(newThreadId, "");
    },
    // Use localStorage (not sessionStorage) for the run-resume key so the
    // runId survives page remounts.  The SDK's default `true` uses
    // sessionStorage which — while technically persistent across client-side
    // navigations — has been observed to lose the key in certain Electron
    // packaged-build scenarios (custom scheme, background throttling).
    // localStorage is more durable and the key is cleaned up automatically
    // by the SDK's onSuccess/onError callbacks.
    reconnectOnMount:
      typeof window !== "undefined" ? () => window.localStorage : false,
    fetchStateHistory: { limit: 1 },
    onCreated(meta) {
      handleStreamStart(meta.thread_id, meta.run_id);
      if (context.agent_name && !isMock) {
        void getAPIClient()
          .threads.update(meta.thread_id, {
            metadata: { agent_name: context.agent_name },
          })
          .catch(() => ({}));
      }
    },
    onLangChainEvent(event) {
      if (event.event === "on_tool_end") {
        listeners.current.onToolEnd?.({
          name: event.name,
          data: event.data,
        });
      }
    },
    onUpdateEvent(data) {
      if (data["SummarizationMiddleware.before_model"]) {
        const _messages = [
          ...(data["SummarizationMiddleware.before_model"].messages ?? []),
        ];

        if (_messages.length < 2) {
          return;
        }
        for (const m of _messages) {
          if (m.name === "summary" && m.type === "human") {
            summarizedRef.current?.add(m.id ?? "");
          }
        }
        const _lastKeepMessage = _messages[2];
        const _currentMessages = [...messagesRef.current];
        const _movedMessages: Message[] = [];
        for (const m of _currentMessages) {
          if (m.id !== undefined && m.id === _lastKeepMessage?.id) {
            break;
          }
          if (!summarizedRef.current?.has(m.id ?? "")) {
            _movedMessages.push(m);
          }
        }
        appendMessages(_movedMessages);
        messagesRef.current = [];
      }

      const updates: Array<Partial<AgentThreadState> | null> = Object.values(
        data || {},
      );
      for (const update of updates) {
        if (update && "title" in update && update.title) {
          void queryClient.setQueriesData(
            {
              queryKey: ["threads", "search"],
              exact: false,
            },
            (oldData: Array<AgentThread> | undefined) => {
              return oldData?.map((t) => {
                if (t.thread_id === threadIdRef.current) {
                  return {
                    ...t,
                    values: {
                      ...t.values,
                      title: update.title,
                    },
                  };
                }
                return t;
              });
            },
          );
        }
      }
    },
    onCustomEvent(event: unknown) {
      handleStreamEvent(event, {
        updateSubtask,
      });
    },
    onError(error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setOptimisticMessages([]);
      if (isStaleStreamJoinError(error)) {
        clearStoredStreamReconnectKey(threadIdRef.current ?? onStreamThreadId);
        void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
        if (threadIdRef.current ?? onStreamThreadId) {
          void queryClient.invalidateQueries({
            queryKey: ["thread", threadIdRef.current ?? onStreamThreadId],
          });
        }
        return;
      }
      // In the desktop packaged build, a "TypeError: network error" on the
      // SSE stream is usually caused by the renderer process being reloaded
      // (e.g. RSC navigation fallback) rather than a real server error.
      // Don't show a toast — the fallback reconnection will silently rejoin
      // the stream once the component remounts.
      if (
        isDesktop() &&
        (errMsg.includes("network error") || errMsg.includes("Failed to fetch"))
      ) {
        return;
      }
      toast.error(getStreamErrorMessage(error));
    },
    onFinish(state) {
      listeners.current.onFinish?.(state.values);
      void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });

      // Run finished — clear the active run_id regardless of stop reason.
      currentRunIdRef.current = null;
      setCurrentRunId(null);

      // 标记"本轮正常结束、待自动发送"。真正的 autoSendNext 触发放在
      // 监听 thread.isLoading 的 effect 里执行（见下方 useEffect），不在此处
      // 同步调用。因为 onFinish 在 useStream 回调内触发，此刻 thread.messages
      // 可能尚未刷新到本轮最终值，直接调 sendMessage 会让 prevMsgCountRef 取到
      // 偏小基准，乐观消息清除时序紊乱，间歇性出现两条相同用户消息。
      if (!stopFlagRef.current) {
        pendingAutoSendRef.current = true;
      }
      // 重置停止标志，为下一次运行做准备。
      stopFlagRef.current = false;
    },
  });

  // Optimistic messages shown before the server stream responds
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const sendInFlightRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const summarizedRef = useRef<Set<string>>(null);
  // Track message count before sending so we know when server has responded
  const prevMsgCountRef = useRef(thread.messages.length);

  summarizedRef.current ??= new Set<string>();

  // Reset thread-local pending UI state when switching between threads so
  // optimistic messages and in-flight guards do not leak across chat views.
  // Also clear the subtask context (workspace-level provider) to prevent
  // stale subagent call info from a previous thread leaking into the right panel.
  useEffect(() => {
    startedRef.current = false;
    sendInFlightRef.current = false;
    messagesRef.current = [];
    summarizedRef.current = new Set<string>();
    setOptimisticMessages([]);
    setSubtasks({});
  }, [threadId, setSubtasks]);

  // ── Fallback run reconnection ────────────────────────────────────────────
  //
  // When the component remounts, the SDK's built-in ``reconnectOnMount``
  // logic reads the stored runId and calls ``joinStream``.  However this
  // can fail silently if:
  //   • the stored runId was already cleaned up by a previous onSuccess,
  //   • the joinStream HTTP request loses a race with state history fetch,
  //   • macOS App Nap delayed the reconnection past the bridge TTL.
  //
  // As a safety net, after mount we poll the backend for any active run on
  // this thread.  If one exists AND the SDK has not already reconnected
  // (``thread.isLoading`` is still false), we manually join it.  This is
  // idempotent — if the SDK already reconnected, the manual join is skipped.
  //
  // The polling uses a ref guard (``reconnectAttemptedRef``) so it only runs
  // once per mount, and the effect cleanup cancels the timeout on unmount.
  const reconnectAttemptedRef = useRef<string | null>(null);
  const threadJoinStreamRef = useRef(thread.joinStream);
  threadJoinStreamRef.current = thread.joinStream;
  const threadIsLoadingRef = useRef(thread.isLoading);
  threadIsLoadingRef.current = thread.isLoading;
  const threadStopRef = useRef((thread as StoppableThread<typeof thread>).stop);
  threadStopRef.current = (thread as StoppableThread<typeof thread>).stop;

  const stopThread = useCallback(async () => {
    // 标记手动停止，让随后的 onFinish 跳过队列自动发送。
    stopFlagRef.current = true;
    const currentThreadId = threadIdRef.current ?? onStreamThreadId ?? undefined;
    let localStopError: unknown;
    try {
      await threadStopRef.current?.();
    } catch (error) {
      localStopError = error;
    } finally {
      setOptimisticMessages([]);
      setIsUploading(false);
      sendInFlightRef.current = false;
      // Mark any in-progress subtasks as failed — the stream is stopped so
      // no completion event will arrive, and the SubtaskCard UI would otherwise
      // stay stuck in the "in_progress" spinner state forever.
      for (const task of Object.values(subtasks)) {
        if (task.status === "in_progress") {
          updateSubtask({
            id: task.id,
            status: "failed",
            error: "Cancelled by user",
          });
        }
      }
    }

    if (!currentThreadId || isMock) {
      if (localStopError) {
        throw toError(localStopError);
      }
      return;
    }

    try {
      const apiClient = getAPIClient();
      const runs = await apiClient.runs.list(currentThreadId);
      const activeRun = runs.find(isActiveRun);
      if (activeRun) {
        await apiClient.runs.cancel(
          currentThreadId,
          activeRun.run_id,
          false,
          "interrupt",
        );
      }
      clearStoredStreamReconnectKey(currentThreadId);
      void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
      void queryClient.invalidateQueries({
        queryKey: ["thread", currentThreadId],
      });
    } catch (error) {
      const status =
        typeof error === "object" && error !== null
          ? Reflect.get(error, "status")
          : undefined;
      if (status === 404 || status === 409 || status === "404" || status === "409") {
        clearStoredStreamReconnectKey(currentThreadId);
        if (localStopError) {
          throw toError(localStopError);
        }
        return;
      }
      if (localStopError) {
        throw toError(error);
      }
      throw toError(error);
    }

    if (localStopError) {
      return;
    }
  }, [isMock, onStreamThreadId, queryClient]);

  useEffect(() => {
    if (!threadId || isMock) return;
    // Only attempt once per threadId per mount.
    if (reconnectAttemptedRef.current === threadId) return;
    reconnectAttemptedRef.current = threadId;

    let cancelled = false;

    const attemptFallbackReconnect = async () => {
      // Give the SDK's built-in reconnection a short window (~800ms) to succeed.
      // Reduced from 2.5s — in the desktop packaged build the reconnectOnMount
      // joinStream fires synchronously on mount; a long delay just makes the
      // user stare at a blank panel while the coding agent is running.
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (cancelled) return;

      // If the SDK already reconnected, nothing to do.
      if (threadIsLoadingRef.current) return;

      try {
        const apiClient = getAPIClient();
        const runs = await apiClient.runs.list(threadId);
        if (cancelled) return;

        // Find the most recent active run (running or pending).
        // Runs are typically returned newest-first.
        const activeRun = runs.find(
          (r) => r.status === "running" || r.status === "pending",
        );

        if (activeRun && !threadIsLoadingRef.current) {
          // Manually join the active run's stream.
          // Pass explicit stream modes — joinStream doesn't auto-track
          // modes like submit does, so without this the reconnected
          // stream would only carry callback modes (updates/custom)
          // and thread.messages would remain empty.
          await threadJoinStreamRef.current?.(activeRun.run_id, undefined, {
            streamMode: ["values", "messages-tuple"],
          });
        } else if (!activeRun) {
          // No active run on the backend — clean up any stale reconnect key
          // so it doesn't cause spurious joinStream errors on the next mount.
          // This is especially important now that we use localStorage (which
          // persists across app restarts) instead of sessionStorage.
          clearStoredStreamReconnectKey(threadId);
        }
      } catch (error) {
        if (isStaleStreamJoinError(error)) {
          clearStoredStreamReconnectKey(threadId);
          void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
          void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
        }
        // Best-effort: if the backend is unreachable or the run list fails,
        // silently give up. The user can still send a new message.
      }
    };

    // Offset the timer so the SDK's reconnectOnMount (which fires in the same
    // render tick on mount) has a chance to win the race and call joinStream
    // before we start polling for active runs.
    const timer = setTimeout(
      () => void attemptFallbackReconnect(),
      800,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [threadId, isMock, queryClient]);

  // Clear optimistic when server messages arrive (count increases)
  useEffect(() => {
    if (
      optimisticMessages.length > 0 &&
      thread.messages.length > prevMsgCountRef.current
    ) {
      setOptimisticMessages([]);
    }
  }, [thread.messages.length, optimisticMessages.length]);

  // ── Deferred queue auto-send (Task 16 fix) ───────────────────────────
  // onFinish 只设置 pendingAutoSendRef；真正的 autoSendNext 在此 effect 里触发。
  // 该 effect 在 thread.isLoading 翻转为 false 时运行，此时 React 已把本轮
  // 最终的 thread.messages 刷新到位，sendMessage 取到的 prevMsgCountRef 基准
  // 正确，乐观消息清除时序稳定，不会出现两条相同用户消息。
  const prevIsLoadingRef = useRef(thread.isLoading);
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    const nowLoading = thread.isLoading;
    prevIsLoadingRef.current = nowLoading;
    // 仅在 loading: true → false 的下降沿触发，且本轮是"正常结束"。
    if (wasLoading && !nowLoading && pendingAutoSendRef.current) {
      pendingAutoSendRef.current = false;
      void autoSendTriggerRef.current?.();
    }
  }, [thread.isLoading]);

  const sendMessage = useCallback(
    async (
      threadId: string | undefined,
      message: PromptInputMessage,
      extraContext?: Record<string, unknown>,
      options?: SendMessageOptions,
    ) => {
      if (sendInFlightRef.current) {
        return;
      }
      sendInFlightRef.current = true;

      const text = message.text.trim();

      // Capture current count before showing optimistic messages
      prevMsgCountRef.current = thread.messages.length;

      // Build optimistic files list with uploading status. The local URL
      // (Data/blob) lets the bubble render an instant image thumbnail while
      // the upload request is still in flight.
      const optimisticFiles: FileInMessage[] = (message.files ?? []).map(
        (f) => ({
          filename: f.filename ?? "",
          size: 0,
          status: "uploading" as const,
          localUrl: f.url,
          mediaType: f.mediaType,
        }),
      );

      const hideFromUI = options?.additionalKwargs?.hide_from_ui === true;
      const optimisticAdditionalKwargs = {
        ...options?.additionalKwargs,
        ...(optimisticFiles.length > 0 ? { files: optimisticFiles } : {}),
      };

      const newOptimistic: Message[] = [];
      if (!hideFromUI) {
        newOptimistic.push({
          type: "human",
          id: `opt-human-${Date.now()}`,
          content: text ? [{ type: "text", text }] : "",
          additional_kwargs: optimisticAdditionalKwargs,
        });
      }

      if (optimisticFiles.length > 0 && !hideFromUI) {
        // Mock AI message while files are being uploaded
        newOptimistic.push({
          type: "ai",
          id: `opt-ai-${Date.now()}`,
          content: t.uploads.uploadingFiles,
          additional_kwargs: { element: "task" },
        });
      }
      setOptimisticMessages(newOptimistic);

      listeners.current.onSend?.(threadId!);

      let uploadedFileInfo: UploadedFileInfo[] = [];

      try {
        // Upload files first if any
        if (message.files && message.files.length > 0) {
          setIsUploading(true);
          try {
            const filePromises = message.files.map((fileUIPart) =>
              promptInputFilePartToFile(fileUIPart),
            );

            const conversionResults = await Promise.all(filePromises);
            const files = conversionResults.filter(
              (file): file is File => file !== null,
            );
            const failedConversions = conversionResults.length - files.length;

            if (failedConversions > 0) {
              throw new Error(
                `Failed to prepare ${failedConversions} attachment(s) for upload. Please retry.`,
              );
            }

            if (!threadId) {
              throw new Error("Thread is not ready for file upload.");
            }

            if (files.length > 0) {
              const uploadResponse = await uploadFiles(threadId, files);
              uploadedFileInfo = uploadResponse.files;

              // Update optimistic human message with uploaded status + paths.
              // Store the sandbox virtual path — the artifacts API rejects
              // host-absolute paths with 400, which killed the image
              // thumbnails in the user bubble. Keep the local preview URL so
              // the thumbnail stays visible until the authenticated artifact
              // URL resolves.
              const localPreviewByFilename = new Map(
                optimisticFiles.map((f) => [f.filename, f] as const),
              );
              const uploadedFiles: FileInMessage[] = uploadedFileInfo.map(
                (info) => ({
                  filename: info.filename,
                  size: info.size,
                  path: info.virtual_path ?? info.path,
                  status: "uploaded" as const,
                  localUrl: localPreviewByFilename.get(info.filename)?.localUrl,
                  mediaType: localPreviewByFilename.get(info.filename)?.mediaType,
                }),
              );
              setOptimisticMessages((messages) => {
                if (messages.length > 1 && messages[0]) {
                  const humanMessage: Message = messages[0];
                  return [
                    {
                      ...humanMessage,
                      additional_kwargs: { files: uploadedFiles },
                    },
                    ...messages.slice(1),
                  ];
                }
                return messages;
              });
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Failed to upload files.";
            toast.error(errorMessage);
            setOptimisticMessages([]);
            throw error;
          } finally {
            setIsUploading(false);
          }
        }

        // Build files metadata for submission (included in additional_kwargs).
        // Virtual paths keep the persisted history renderable via the
        // artifacts API after replay.
        const filesForSubmit: FileInMessage[] = uploadedFileInfo.map(
          (info) => ({
            filename: info.filename,
            size: info.size,
            path: info.virtual_path ?? info.path,
            status: "uploaded" as const,
          }),
        );

        // Wrap submit so we can retry with the "interrupt" multitask strategy
        // when the default "reject" returns 409. An orphaned run may still be
        // alive (onDisconnect:"continue"); without this retry the user is
        // stuck and must restart the backend to clear the orphan.
        const doSubmit = async (strategy?: "interrupt") => {
          // 推理深度档位：未显式选择时按最低档（闪速语义）保守处理，
          // 避免 thinking/plan/subagent 意外开启。
          const effort = context.reasoning_effort ?? "minimal";
          await thread.submit(
            {
              messages: [
                {
                  type: "human",
                  content: [
                    {
                      type: "text",
                      text,
                    },
                  ],
                  additional_kwargs: {
                    ...options?.additionalKwargs,
                    ...(filesForSubmit.length > 0
                      ? { files: filesForSubmit }
                      : {}),
                  },
                },
              ],
            },
            {
              threadId: threadId,
              // Explicitly request values + messages-tuple stream modes.
              // In SDK 1.6.0 these modes are auto-tracked via property getters
              // (thread.messages / thread.values), but the tracking ref can
              // lose its entries after stream.clear() fires on threadId change.
              // Without these modes the backend never sends full-state snapshots,
              // so thread.messages stays empty and the user sees no output.
              streamMode: ["values", "messages-tuple"],
              streamSubgraphs: true,
              // streamResumable is intentionally omitted: QiLin does not support
              // resumable streams (HTTP 422). sanitizeRunStreamOptions in
              // api-client.ts also strips it as a safety net.
              // Keep the task running even if the current page unmounts and
              // drops its SSE connection, so the frontend can rejoin instead
              // of cancelling work.
              onDisconnect: "continue",
              multitaskStrategy: strategy,
              config: {
                recursion_limit: 10000,
              },
              context: {
                ...extraContext,
                ...context,
                // 推理深度档位即原模式档位：minimal→闪速 / low→思考 /
                // medium→Pro / high→Ultra，三个行为开关由档位派生。
                thinking_enabled: effort !== "minimal",
                is_plan_mode: effort === "medium" || effort === "high",
                subagent_enabled: effort === "high",
                reasoning_effort: effort,
                thread_id: threadId,
                // Forward the per-thread user-selected workspace path so
                // the backend sandbox grants bash/read/write access to
                // this directory. Falls back to the default user data
                // root (~/.kworks) when undefined.
                user_workspace_path: context.user_workspace_path,
              },
            },
          );
        };

        try {
          await doSubmit();
        } catch (error) {
          if (isThreadBusyConflict(error)) {
            toast.info("已有任务在运行，正在接管并继续…");
            await doSubmit("interrupt");
          } else {
            throw error;
          }
        }
        void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
      } catch (error) {
        setOptimisticMessages([]);
        setIsUploading(false);
        throw error;
      } finally {
        sendInFlightRef.current = false;
      }
    },
    [thread, t.uploads.uploadingFiles, context, queryClient],
  );

  // Cache the latest thread messages in a ref to compare against incoming history messages for deduplication,
  // and to allow access to the full message list in onUpdateEvent without causing re-renders.
  if (thread.messages.length >= messagesRef.current.length) {
    messagesRef.current = thread.messages;
  }

  const getThreadMessageMetadata = (
    thread as typeof thread & {
      getMessagesMetadata?: (message: Message, index?: number) => unknown;
    }
  ).getMessagesMetadata;
  const filteredThreadMessages = thread.messages.filter(
    (msg, index) =>
      !isHiddenFromUIMessage(msg, getThreadMessageMetadata?.(msg, index)),
  );

  // Always merge all three sources.  When the outer `threadId` prop is still
  // undefined (brand-new thread — the SDK creates the thread inside submit()
  // and only later calls onStart → setThreadId in the parent), the SDK's
  // internal stream may already be delivering messages.  The previous guard
  // `threadId ? merge : optimistic-only` discarded those live stream messages
  // during the ~100ms window between stream-start and parent re-render,
  // causing the user's message to "flash and disappear".
  //
  // Safe because when nothing has arrived yet, all three arrays are empty
  // and mergeMessages returns [].  When history loads for an existing thread,
  // it merges correctly.  When the stream delivers messages before the parent
  // propagates the new threadId, they still display.
  const mergedMessages = mergeMessages(
    history,
    filteredThreadMessages,
    optimisticMessages,
  );

  // ── Cross-mount display bridge ─────────────────────────────────
  // While `useStream` is reconnecting after a remount, `thread.messages` is
  // empty and `thread.isLoading` resets to false — causing a flash of empty
  // content and a ready→streaming status toggle.  Until the live stream
  // produces its first message, fall back to the cached display state so the
  // UI stays visually identical across remounts.  Once the stream has
  // data (or has definitively settled with no messages) the live values take
  // over seamlessly.
  const restored = runtimeSnapshot ?? restoredStateRef.current;
  const streamHasData = filteredThreadMessages.length > 0;
  const inReconnectTransition =
    !!threadId && !streamHasData && !!restored;
  const displayMessages = inReconnectTransition
    ? restored.messages
    : mergedMessages;
  const displayIsLoading = inReconnectTransition
    ? restored.isLoading
    : thread.isLoading;

  // Persist the current display state so the next mount can restore it.
  // Only cache when we have meaningful data (non-empty messages or an active
  // streaming state) to avoid overwriting a good cache with an empty one.
  useEffect(() => {
    if (!threadId) return;
    const hasContent = displayMessages.length > 0 || displayIsLoading;
    if (!hasContent) return;
    const snapshot = {
      messages: displayMessages,
      values: thread.values,
      isLoading: displayIsLoading,
      error: thread.error,
    };
    publishThreadRuntimeSnapshot(threadId, snapshot);
    setCachedThreadState(threadId, snapshot);
  }, [
    threadId,
    displayMessages,
    displayIsLoading,
    thread.values,
    thread.error,
  ]);

  // Merge history, live stream, and optimistic messages for display
  // History messages may overlap with thread.messages; thread.messages take precedence
  const mergedThread = {
    ...thread,
    messages: displayMessages,
    isLoading: displayIsLoading,
    stop: stopThread,
  } as typeof thread;

  // 注册队列自动发送触发器；由页面在挂载 useQueueCoordinator 后调用，
  // 把协调器的 autoSendNext 注册到 onFinish 链路。
  const registerAutoSendTrigger = useCallback(
    (fn: (() => Promise<void>) | null) => {
      autoSendTriggerRef.current = fn;
    },
    [],
  );

  return {
    thread: mergedThread,
    sendMessage,
    isUploading,
    isHistoryLoading,
    hasMoreHistory,
    loadMoreHistory,
    // The real thread ID currently being streamed.  Updated by the SDK's
    // onCreated callback (handleStreamStart).  Exposed so callers that need
    // the live thread ID (e.g. coding-workbench panels querying session/event/
    // roi APIs) don't have to rely solely on the onStart callback chain.
    streamThreadId: onStreamThreadId ?? undefined,
    // 当前活动 run_id（运行中时非空），供队列协调器做消息注入。
    // 用 state 而非 ref.current，确保 onCreated 设置后触发重渲染，
    // coordinator 能拿到最新值。
    currentRunId,
    // 注册 autoSend 触发器：onFinish 正常结束时会调用它来发送队列下一条。
    registerAutoSendTrigger,
  } as const;
}

export function useThreadHistory(
  threadId: string,
  options: { deferInitialLoad?: boolean } = {},
) {
  const { deferInitialLoad = false } = options;
  const runs = useThreadRuns(threadId);
  const threadIdRef = useRef(threadId);
  const runsRef = useRef(runs.data ?? []);
  const indexRef = useRef(-1);
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  loadingRef.current = loading;
  const loadMessages = useCallback(async () => {
    if (runsRef.current.length === 0) {
      return;
    }
    const run = runsRef.current[indexRef.current];
    if (!run || loadingRef.current) {
      return;
    }
    try {
      setLoading(true);
      const result: { data: RunMessage[]; hasMore: boolean } = await fetch(
        `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadIdRef.current)}/runs/${encodeURIComponent(run.run_id)}/messages`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      ).then((res) => {
        return res.json();
      });
      const _messages = result.data
        .filter((m) => !isHiddenFromUIMessage(m.content, m.metadata))
        .map((m) => m.content);
      setMessages((prev) => [..._messages, ...prev]);
      indexRef.current -= 1;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);
  // Clear messages and pagination cursors whenever the thread changes so
  // that history from the previous thread does not leak into the new view.
  // This is critical when navigating from a historical thread to a brand-new
  // chat: `useThreadRuns("")` returns an empty list and `loadMessages()`
  // early-returns, so without this reset the previous thread's messages would
  // persist in state and render behind the new-chat InputBox/Welcome.
  useEffect(() => {
    setMessages([]);
    indexRef.current = -1;
    runsRef.current = [];
  }, [threadId]);

  useEffect(() => {
    threadIdRef.current = threadId;
    if (runs.data && runs.data.length > 0) {
      runsRef.current = runs.data ?? [];
      indexRef.current = runs.data.length - 1;
    }
    if (deferInitialLoad) {
      return;
    }
    loadMessages().catch(() => {
      toast.error("Failed to load thread history.");
    });
  }, [threadId, runs.data, loadMessages, deferInitialLoad]);

  const appendMessages = useCallback((_messages: Message[]) => {
    setMessages((prev) => {
      return [...prev, ..._messages];
    });
  }, []);
  const hasMore = indexRef.current >= 0 || !runs.data;
  return {
    runs: runs.data,
    messages,
    loading,
    appendMessages,
    hasMore,
    loadMore: loadMessages,
  };
}

export function useThreads(
  params: Parameters<ThreadsClient["search"]>[0] = {
    limit: 50,
    sortBy: "updated_at",
    sortOrder: "desc",
    select: ["thread_id", "updated_at", "values", "metadata"],
  },
) {
  const apiClient = getAPIClient();
  return useQuery<AgentThread[]>({
    queryKey: ["threads", "search", params],
    queryFn: async () => {
      const maxResults = params.limit;
      const initialOffset = params.offset ?? 0;
      const DEFAULT_PAGE_SIZE = 50;

      // Preserve prior semantics: if a non-positive limit is explicitly provided,
      // delegate to a single search call with the original parameters.
      if (maxResults !== undefined && maxResults <= 0) {
        const response =
          await apiClient.threads.search<AgentThreadState>(params);
        return response as AgentThread[];
      }

      const pageSize =
        typeof maxResults === "number" && maxResults > 0
          ? Math.min(DEFAULT_PAGE_SIZE, maxResults)
          : DEFAULT_PAGE_SIZE;

      const threads: AgentThread[] = [];
      let offset = initialOffset;

      while (true) {
        if (typeof maxResults === "number" && threads.length >= maxResults) {
          break;
        }

        const currentLimit =
          typeof maxResults === "number"
            ? Math.min(pageSize, maxResults - threads.length)
            : pageSize;

        if (typeof maxResults === "number" && currentLimit <= 0) {
          break;
        }

        const response = (await apiClient.threads.search<AgentThreadState>({
          ...params,
          limit: currentLimit,
          offset,
        })) as AgentThread[];

        threads.push(...response);

        if (response.length < currentLimit) {
          break;
        }

        offset += response.length;
      }

      return threads;
    },
    refetchOnWindowFocus: false,
  });
}

export function useThreadRuns(threadId?: string) {
  const apiClient = getAPIClient();
  return useQuery<Run[]>({
    queryKey: ["thread", threadId],
    queryFn: async () => {
      if (!threadId) {
        return [];
      }
      const response = await apiClient.runs.list(threadId);
      return response;
    },
    refetchOnWindowFocus: false,
  });
}

export function useRunDetail(threadId: string, runId: string) {
  const apiClient = getAPIClient();
  return useQuery<Run>({
    queryKey: ["thread", threadId, "run", runId],
    queryFn: async () => {
      const response = await apiClient.runs.get(threadId, runId);
      return response;
    },
    refetchOnWindowFocus: false,
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  const apiClient = getAPIClient();
  return useMutation({
    mutationFn: async ({ threadId }: { threadId: string }) => {
      await apiClient.threads.delete(threadId);

      const response = await fetch(
        `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: "Failed to delete local thread data." }));
        throw new Error(error.detail ?? "Failed to delete local thread data.");
      }
    },
    onSuccess(_, { threadId }) {
      queryClient.setQueriesData(
        {
          queryKey: ["threads", "search"],
          exact: false,
        },
        (oldData: Array<AgentThread> | undefined) => {
          if (oldData == null) {
            return oldData;
          }
          return oldData.filter((t) => t.thread_id !== threadId);
        },
      );
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
    },
  });
}

export function useRenameThread() {
  const queryClient = useQueryClient();
  const apiClient = getAPIClient();
  return useMutation({
    mutationFn: async ({
      threadId,
      title,
    }: {
      threadId: string;
      title: string;
    }) => {
      await apiClient.threads.updateState(threadId, {
        values: { title },
      });
    },
    onSuccess(_, { threadId, title }) {
      queryClient.setQueriesData(
        {
          queryKey: ["threads", "search"],
          exact: false,
        },
        (oldData: Array<AgentThread>) => {
          return oldData.map((t) => {
            if (t.thread_id === threadId) {
              return {
                ...t,
                values: {
                  ...t.values,
                  title,
                },
              };
            }
            return t;
          });
        },
      );
    },
  });
}
