"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 待发送消息队列 store。
 *
 * 作用：当模型正在执行任务时，用户新发送的消息默认进入此队列（而非打断任务）。
 * 任务结束后由协调器自动按序发送；用户也可对某条点"立即注入"。
 *
 * 持久化：localStorage 按 thread_id 隔离（key: kworks.queuedMsgs.<thread_id>）。
 * 仅持久化 pending 状态；injected 丢弃；injecting/sending/error 加载时降级回 pending。
 *
 * 模式：模块级 Map + useSyncExternalStore（仿 runtime-store.ts）。
 */

export type QueuedMessageStatus =
  | "pending"
  | "injecting"
  | "injected"
  | "sending"
  | "error";

export interface QueuedMessage {
  id: string;
  threadId: string;
  content: string;
  attachments?: unknown[];
  queuedAt: number;
  status: QueuedMessageStatus;
  error?: string;
  source: "queue" | "inject";
}

interface ThreadQueueState {
  messages: QueuedMessage[];
}

const STORAGE_PREFIX = "kworks.queuedMsgs.";
const MAX_QUEUED_PER_THREAD = 20;
const SAVE_DEBOUNCE_MS = 300;

// 内存索引（订阅源）
const queues = new Map<string, ThreadQueueState>();
const listeners = new Map<string, Set<() => void>>();
// 防抖保存的定时器
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

// === 生成唯一 ID ===
function genId(): string {
  return `qm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// === 订阅机制 ===
function getQueue(threadId: string): ThreadQueueState {
  let q = queues.get(threadId);
  if (!q) {
    q = loadFromStorage(threadId) ?? { messages: [] };
    queues.set(threadId, q);
  }
  return q;
}

function emit(threadId: string) {
  const set = listeners.get(threadId);
  if (set) for (const l of set) l();
}

function subscribe(threadId: string, listener: () => void): () => void {
  let set = listeners.get(threadId);
  if (!set) {
    set = new Set();
    listeners.set(threadId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

// === localStorage ===
/**
 * 读取某 thread 的队列快照，应用三态规则：
 * - injected → 丢弃
 * - injecting/sending/error → 降级为 pending（清空 error）
 *
 * 若该 thread 已加载到内存（热路径），以内存为准（内存是单一真相源，
 * 磁盘写入可能因防抖滞后）；否则冷启动从 localStorage 读取。
 */
export function loadFromStorage(threadId: string): ThreadQueueState | null {
  const memQueue = queues.get(threadId);
  if (memQueue) {
    return applyLoadTransform(memQueue);
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + threadId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThreadQueueState;
    return applyLoadTransform(parsed);
  } catch {
    // 损坏 JSON：静默清理
    try {
      localStorage.removeItem(STORAGE_PREFIX + threadId);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function applyLoadTransform(state: ThreadQueueState): ThreadQueueState {
  const messages = (state.messages ?? [])
    .filter((m) => m.status !== "injected")
    .map((m) => ({
      ...m,
      status: "pending" as QueuedMessageStatus,
      error: undefined,
    }));
  return { messages };
}

function saveToStorageImmediate(threadId: string) {
  try {
    const q = queues.get(threadId);
    if (!q) return;
    // 只持久化 pending 状态（终态/进行态由内存管理）
    const persistable: ThreadQueueState = {
      messages: q.messages
        .filter((m) => m.status === "pending")
        .map((m) => ({ ...m, status: "pending" as const })),
    };
    localStorage.setItem(
      STORAGE_PREFIX + threadId,
      JSON.stringify(persistable),
    );
  } catch (e) {
    // QuotaExceeded：丢弃最旧 pending 重试
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      const q = queues.get(threadId);
      if (q && q.messages.length > 1) {
        const firstPendingIdx = q.messages.findIndex(
          (m) => m.status === "pending",
        );
        if (firstPendingIdx >= 0) {
          q.messages.splice(firstPendingIdx, 1);
          saveToStorageImmediate(threadId);
        }
      }
    }
  }
}

function saveToStorageDebounced(threadId: string) {
  const existing = saveTimers.get(threadId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    saveTimers.delete(threadId);
    saveToStorageImmediate(threadId);
  }, SAVE_DEBOUNCE_MS);
  saveTimers.set(threadId, timer);
}

export function clearStorage(threadId: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + threadId);
  } catch {
    /* ignore */
  }
  queues.delete(threadId);
  emit(threadId);
}

// === 业务操作 ===
export function enqueue(
  threadId: string,
  content: string,
  attachments?: unknown[],
): QueuedMessage {
  const q = getQueue(threadId);
  const pendingCount = q.messages.filter((m) => m.status === "pending").length;
  if (pendingCount >= MAX_QUEUED_PER_THREAD) {
    throw new Error(`队列已满（最多 ${MAX_QUEUED_PER_THREAD} 条）`);
  }
  const msg: QueuedMessage = {
    id: genId(),
    threadId,
    content,
    attachments,
    queuedAt: Date.now(),
    status: "pending",
    source: "queue",
  };
  q.messages.push(msg);
  saveToStorageImmediate(threadId);
  emit(threadId);
  return msg;
}

export function remove(threadId: string, messageId: string) {
  const q = getQueue(threadId);
  const idx = q.messages.findIndex((m) => m.id === messageId);
  if (idx >= 0) {
    q.messages.splice(idx, 1);
    saveToStorageImmediate(threadId);
    emit(threadId);
  }
}

export function updateStatus(
  threadId: string,
  messageId: string,
  status: QueuedMessageStatus,
  error?: string,
) {
  const q = getQueue(threadId);
  const msg = q.messages.find((m) => m.id === messageId);
  if (msg) {
    msg.status = status;
    msg.error = error;
    saveToStorageDebounced(threadId);
    emit(threadId);
  }
}

export function editContent(
  threadId: string,
  messageId: string,
  content: string,
) {
  const q = getQueue(threadId);
  const msg = q.messages.find((m) => m.id === messageId);
  if (msg) {
    msg.content = content;
    saveToStorageImmediate(threadId);
    emit(threadId);
  }
}

export function reorder(
  threadId: string,
  messageId: string,
  direction: "up" | "down",
) {
  const q = getQueue(threadId);
  // 待重排的 pending 消息在 q.messages 中的真实索引（保持 queuedAt 顺序）
  const pendingIdxs = q.messages.reduce((acc: number[], m, i) => {
    if (m.status === "pending") acc.push(i);
    return acc;
  }, []);
  const curPos = pendingIdxs.findIndex((i) => q.messages[i]?.id === messageId);
  if (curPos < 0) return;
  const swapPos = direction === "up" ? curPos - 1 : curPos + 1;
  if (swapPos < 0 || swapPos >= pendingIdxs.length) return;
  const a = pendingIdxs[curPos];
  const b = pendingIdxs[swapPos];
  if (a === undefined || b === undefined) return;
  const tmp = q.messages[a];
  if (!tmp) return;
  const other = q.messages[b];
  if (!other) return;
  q.messages[a] = other;
  q.messages[b] = tmp;
  saveToStorageImmediate(threadId);
  emit(threadId);
}

export function getSendable(threadId: string): QueuedMessage[] {
  const q = getQueue(threadId);
  return q.messages
    .filter((m) => m.status === "pending")
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

export function getInjecting(threadId: string): QueuedMessage[] {
  const q = getQueue(threadId);
  return q.messages.filter((m) => m.status === "injecting");
}

export function clearConsumed(threadId: string) {
  const q = getQueue(threadId);
  const before = q.messages.length;
  q.messages = q.messages.filter(
    (m) => m.status !== "injected" && m.status !== "sending",
  );
  if (q.messages.length !== before) {
    saveToStorageDebounced(threadId);
    emit(threadId);
  }
}

// === React Hook ===
export function useThreadQueue(threadId: string) {
  const subscribeCb = useCallback(
    (cb: () => void) => subscribe(threadId, cb),
    [threadId],
  );
  const getSnapshot = useCallback(() => getQueue(threadId), [threadId]);

  const state = useSyncExternalStore(subscribeCb, getSnapshot, getSnapshot);

  const enqueueCb = useCallback(
    (content: string, attachments?: unknown[]) =>
      enqueue(threadId, content, attachments),
    [threadId],
  );
  const removeCb = useCallback(
    (id: string) => remove(threadId, id),
    [threadId],
  );
  const updateStatusCb = useCallback(
    (id: string, s: QueuedMessageStatus, err?: string) =>
      updateStatus(threadId, id, s, err),
    [threadId],
  );
  const reorderCb = useCallback(
    (id: string, d: "up" | "down") => reorder(threadId, id, d),
    [threadId],
  );

  return {
    messages: state.messages,
    enqueue: enqueueCb,
    remove: removeCb,
    updateStatus: updateStatusCb,
    reorder: reorderCb,
  };
}
