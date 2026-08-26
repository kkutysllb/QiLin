"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PencilIcon,
  RotateCwIcon,
  SendHorizonalIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/core/i18n/hooks";
import type {
  QueuedMessage,
  QueuedMessageStatus,
} from "@/core/threads/queue-store";
import { cn } from "@/lib/utils";

// 左侧状态色条（更克制的视觉，替代原来花哨的 Badge 背景）
const STATUS_BAR_CLASS: Record<QueuedMessageStatus, string> = {
  pending: "bg-muted-foreground/40",
  injecting: "bg-blue-500",
  injected: "bg-emerald-500",
  sending: "bg-blue-500",
  error: "bg-red-500",
};

interface Props {
  /** 所有队列消息（含 pending/injecting/injected/sending/error 各态） */
  messages: QueuedMessage[];
  /** 当前是否有运行中的任务（决定⚡按钮可用性） */
  isStreaming: boolean;
  /** 立即注入回调 */
  onInject: (msg: QueuedMessage) => void;
  /** 删除回调 */
  onRemove: (id: string) => void;
  /** 编辑内容回调 */
  onEdit: (id: string, newContent: string) => void;
  /** 重试回调（error 态） */
  onRetry: (msg: QueuedMessage) => void;
  /** 重排回调 */
  onReorder: (id: string, direction: "up" | "down") => void;
  /** 全部发送回调 */
  onSendAll: () => void;
}

export function QueuedMessagesBar({
  messages,
  isStreaming,
  onInject,
  onRemove,
  onEdit,
  onRetry,
  onReorder,
  onSendAll,
}: Props) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (messages.length === 0) return null;

  const statusLabel: Record<QueuedMessageStatus, string> = {
    pending: t.queue.status.pending,
    injecting: t.queue.status.injecting,
    injected: t.queue.status.injected,
    sending: t.queue.status.sending,
    error: t.queue.status.error,
  };

  const pendingCount = messages.filter((m) => m.status === "pending").length;

  const startEdit = (msg: QueuedMessage) => {
    setEditingId(msg.id);
    setEditValue(msg.content);
  };
  const commitEdit = () => {
    if (editingId && editValue.trim()) onEdit(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-1.5 border-t bg-background px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t.queue.title} ({pendingCount})
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            disabled={pendingCount === 0 || isStreaming}
            onClick={onSendAll}
            title={
              isStreaming
                ? t.queue.sendAllStreamingTitle
                : t.queue.sendAllAllTitle
            }
          >
            <SendHorizonalIcon className="size-3" />
            {t.queue.sendAll}
          </Button>
        </div>

        <div
          role="list"
          aria-label={t.queue.title}
          className="flex max-h-48 flex-col gap-1 overflow-y-auto"
        >
          {messages.map((msg) => {
            const pendingMsgs = messages.filter((m) => m.status === "pending");
            const pendingPos = pendingMsgs.findIndex((m) => m.id === msg.id);
            const canMoveUp = msg.status === "pending" && pendingPos > 0;
            const canMoveDown =
              msg.status === "pending" &&
              pendingPos >= 0 &&
              pendingPos < pendingMsgs.length - 1;
            return (
              <div
                key={msg.id}
                role="listitem"
                className={cn(
                  "flex items-start gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs",
                  msg.status === "error" && "border-red-300 dark:border-red-800",
                )}
              >
                {/* 左侧状态色条 */}
                <span
                  className={cn(
                    "mt-0.5 h-3 w-1 shrink-0 rounded-full",
                    STATUS_BAR_CLASS[msg.status],
                  )}
                  aria-hidden
                />

                {/* 中间：状态标签 + 内容 */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    {(msg.status === "injecting" ||
                      msg.status === "sending") && (
                      <Loader2Icon className="size-2.5 animate-spin" />
                    )}
                    {statusLabel[msg.status]}
                    {msg.status === "error" && msg.error && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="max-w-40 truncate text-red-600">
                            {msg.error}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{msg.error}</TooltipContent>
                      </Tooltip>
                    )}
                  </span>

                  {editingId === msg.id ? (
                    <textarea
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="w-full resize-none rounded border bg-background px-1.5 py-1 text-xs outline-none"
                      rows={2}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-foreground">
                      {msg.content}
                    </p>
                  )}
                </div>

                {/* 右侧操作按钮组 */}
                <div className="flex shrink-0 items-center gap-0.5">
                  {msg.status === "pending" && (
                    <>
                      <IconBtn
                        label={t.queue.action.moveUp}
                        onClick={() => onReorder(msg.id, "up")}
                        disabled={!canMoveUp}
                      >
                        <ArrowUpIcon className="size-3" />
                      </IconBtn>
                      <IconBtn
                        label="下移"
                        onClick={() => onReorder(msg.id, "down")}
                        disabled={!canMoveDown}
                      >
                        <ArrowDownIcon className="size-3" />
                      </IconBtn>
                      <IconBtn
                        label={t.queue.action.edit}
                        onClick={() => startEdit(msg)}
                      >
                        <PencilIcon className="size-3" />
                      </IconBtn>
                      <IconBtn
                        label={t.queue.action.delete}
                        onClick={() => onRemove(msg.id)}
                      >
                        <Trash2Icon className="size-3" />
                      </IconBtn>
                      <IconBtn
                        label={
                          isStreaming
                            ? t.queue.action.injectActiveTitle
                            : t.queue.action.injectInactiveTitle
                        }
                        disabled={!isStreaming}
                        onClick={() => onInject(msg)}
                        className={cn(
                          isStreaming && "text-blue-600 hover:text-blue-700",
                        )}
                      >
                        <ZapIcon className="size-3.5" />
                      </IconBtn>
                    </>
                  )}
                  {msg.status === "injected" && (
                    <IconBtn
                      label={t.queue.action.deleteInjectedTitle}
                      onClick={() => onRemove(msg.id)}
                    >
                      <Trash2Icon className="size-3" />
                    </IconBtn>
                  )}
                  {msg.status === "error" && (
                    <>
                      <IconBtn
                        label={t.queue.action.retry}
                        onClick={() => onRetry(msg)}
                      >
                        <RotateCwIcon className="size-3" />
                      </IconBtn>
                      <IconBtn
                        label={t.queue.action.delete}
                        onClick={() => onRemove(msg.id)}
                      >
                        <Trash2Icon className="size-3" />
                      </IconBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-6",
            disabled && "cursor-not-allowed opacity-40",
            className,
          )}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
