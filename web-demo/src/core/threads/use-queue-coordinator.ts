"use client";

import { useCallback, useEffect, useRef } from "react";

import { injectMessage, InjectError } from "@/core/api/inject";

import {
  useThreadQueue,
  enqueue as storeEnqueue,
  editContent as storeEditContent,
  getSendable,
  getInjecting,
  remove as storeRemove,
  updateStatus as storeUpdateStatus,
  clearConsumed as storeClearConsumed,
  type QueuedMessage,
} from "./queue-store";

/**
 * autoSendNext 在没有 pending 项但存在 injecting 项时的重试参数。
 *
 * 竞态 1（inject 与 run finish 撞车）：
 *   用户点 ⚡ 注入 → 请求在飞 → 同时 run 结束 → onFinish 触发 autoSendNext。
 *   此刻该队列项是 injecting（不是 pending），getSendable 跳过它。
 *   随后注入请求返回 409 → 降级回 pending；但 autoSendNext 已结束、漏发。
 *   解法：autoSendNext 在 sendable 为空但存在 injecting 项时，延迟 500ms 重试
 *   （最多 3 次 = 1.5s），给在飞的注入请求时间完成/降级。
 */
const AUTOSEND_RETRY_DELAY_MS = 500;
const AUTOSEND_RETRY_MAX = 3;

export interface ThreadStreamLike {
  sendMessage: (content: string, attachments?: unknown[]) => Promise<void>;
}

export function useQueueCoordinator(
  threadId: string,
  threadStream: ThreadStreamLike,
  currentRunId: string | null,
) {
  const { messages, remove, updateStatus, reorder } =
    useThreadQueue(threadId);
  const retryCountRef = useRef(0);
  // 用 ref 间接持有最新的 autoSendNext，供 setTimeout 递归重试调用，
  // 避免 useCallback 闭包捕获过期实例 / ESLint exhaustive-deps 警告。
  const autoSendNextRef = useRef<() => Promise<void>>(async () => {
    // 占位：首次 render 后由下方赋值替换为真实实现。
  });
  // 持有挂起的 setTimeout 句柄，组件卸载时清理，避免卸载后重试回调触发。
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 标记 autoSendNext 是否正在执行，防止 onFinish 重入导致重叠的重试链。
  // setTimeout 调度的重试是“未来”调用：当前调用先 return（释放标志），定时器
  // 才会触发，因此重试可以正常进行；但并发的同步重入会被拦截。
  const autoSendInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const enqueueCb = useCallback(
    (content: string, attachments?: unknown[]) => {
      storeEnqueue(threadId, content, attachments);
    },
    [threadId],
  );

  const editContentCb = useCallback(
    (messageId: string, content: string) => {
      storeEditContent(threadId, messageId, content);
    },
    [threadId],
  );

  const injectNow = useCallback(
    async (msg: QueuedMessage) => {
      if (!currentRunId) {
        return;
      }
      storeUpdateStatus(threadId, msg.id, "injecting");
      try {
        const resp = await injectMessage(threadId, currentRunId, {
          content: msg.content,
          attachments: msg.attachments,
          messageId: msg.id,
          queuedAt: msg.queuedAt,
        });
        storeUpdateStatus(threadId, msg.id, "injected");
      } catch (e) {
        console.error("[injectNow] API failed", e);
        if (e instanceof InjectError && e.code === "run_not_active") {
          // 降级：任务已结束，转 pending 等待自动/手动发送。
          storeUpdateStatus(threadId, msg.id, "pending");
        } else {
          const errMsg = e instanceof Error ? e.message : String(e);
          storeUpdateStatus(threadId, msg.id, "error", errMsg);
        }
      }
    },
    [threadId, currentRunId],
  );

  const autoSendNext = useCallback(async () => {
    // 已有进行中的发送循环，跳过（防止 onFinish 重入导致重叠重试链）。
    if (autoSendInFlightRef.current) return;
    autoSendInFlightRef.current = true;
    try {
      const sendable = getSendable(threadId);
      if (sendable.length === 0) {
        // 有正在注入的项？延迟重试，等它降级回 pending（竞态 1）。
        const injecting = getInjecting(threadId);
        if (
          injecting.length > 0 &&
          retryCountRef.current < AUTOSEND_RETRY_MAX
        ) {
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void autoSendNextRef.current();
          }, AUTOSEND_RETRY_DELAY_MS);
          return;
        }
        retryCountRef.current = 0;
        storeClearConsumed(threadId);
        return;
      }
      retryCountRef.current = 0;
      const next = sendable[0]!;
      storeUpdateStatus(threadId, next.id, "sending");
      try {
        await threadStream.sendMessage(next.content, next.attachments);
        storeRemove(threadId, next.id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        storeUpdateStatus(threadId, next.id, "error", errMsg);
      }
    } finally {
      autoSendInFlightRef.current = false;
    }
  }, [threadId, threadStream]);

  // 始终把 ref 指向最新实例，供 setTimeout 递归回调取用。
  autoSendNextRef.current = autoSendNext;

  const manualSendAll = useCallback(async () => {
    let sendable = getSendable(threadId);
    while (sendable.length > 0) {
      const next = sendable[0]!;
      storeUpdateStatus(threadId, next.id, "sending");
      try {
        await threadStream.sendMessage(next.content, next.attachments);
        storeRemove(threadId, next.id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        storeUpdateStatus(threadId, next.id, "error", errMsg);
        break; // 单条失败停止链式发送
      }
      sendable = getSendable(threadId);
    }
  }, [threadId, threadStream]);

  return {
    messages,
    enqueue: enqueueCb,
    editContent: editContentCb,
    injectNow,
    autoSendNext,
    manualSendAll,
    remove,
    updateStatus,
    reorder,
  };
}
