"use client";

// 繁忙态消息队列 dock——交互与视觉对齐 DSH ui-conversation QueueDock：
// 多条时折叠为「N 条排队消息」计数头（默认收起），单条直接铺开；
// 行内单行省略预览 + 右侧 28px 圆形图标操作（编辑/删除/插话发送）。
// 插话（steer）= DSH next-step 语义：仅在运行中可用，经 /inject
// 并入当前任务的下一次模型调用；不可用时按钮禁用并给出解释 tooltip。

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LayersIcon,
  Loader2Icon,
  PencilIcon,
  RotateCwIcon,
  SendHorizonalIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";

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

// 非 pending 态的小状态徽标（pending 行保持 DSH 式干净单行）。
const STATUS_BADGE: Partial<
  Record<
    QueuedMessageStatus,
    {
      labelKey: "injecting" | "injected" | "sending" | "error";
      className: string;
    }
  >
> = {
  injecting: { labelKey: "injecting", className: "text-blue-500" },
  injected: { labelKey: "injected", className: "text-emerald-500" },
  sending: { labelKey: "sending", className: "text-blue-500" },
  error: { labelKey: "error", className: "text-red-500" },
};

interface Props {
  /** 所有队列消息（含 pending/injecting/injected/sending/error 各态） */
  messages: QueuedMessage[];
  /** 当前是否有运行中的任务（决定插话按钮可用性） */
  isStreaming: boolean;
  /** 立即注入回调（插话发送） */
  onInject: (msg: QueuedMessage) => void;
  /** 删除回调 */
  onRemove: (id: string) => void;
  /** 编辑内容回调 */
  onEdit: (id: string, newContent: string) => void;
  /** 重试回调（error 态） */
  onRetry: (msg: QueuedMessage) => void;
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
  onSendAll,
}: Props) {
  const { t } = useI18n();
  const listId = useId();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState(true);

  if (messages.length === 0) return null;

  const rowCount = messages.length;
  const pendingCount = messages.filter((m) => m.status === "pending").length;
  const expanded = !collapsed || editing !== null;
  const listVisible = rowCount === 1 || expanded;

  function commitEdit() {
    if (editing?.text.trim()) {
      onEdit(editing.id, editing.text.trim());
    }
    setEditing(null);
  }

  return (
    <TooltipProvider delayDuration={300}>
      {/* 负外边距吸收父容器 gap-4 的一部分，让 dock 视觉上贴住下方输入卡；
          圆角只留顶部，底边由输入卡自己的顶边框闭合（DSH 同款造型）。 */}
      <div className="-mb-2" data-queue-dock="">
        <div className="overflow-hidden rounded-t-xl border border-b-0 bg-muted/40 px-1 py-0.5">
          {rowCount > 1 && (
            <div className="flex items-center">
              <button
                type="button"
                aria-controls={listId}
                aria-expanded={expanded}
                onClick={() => setCollapsed((value) => !value)}
                className="text-foreground/90 hover:bg-muted/60 flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium"
              >
                <LayersIcon
                  aria-hidden
                  className="text-muted-foreground size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  {rowCount} {t.queue.count}
                </span>
                {expanded ? (
                  <ChevronDownIcon
                    aria-hidden
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                ) : (
                  <ChevronUpIcon
                    aria-hidden
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                )}
              </button>
              <ActionIconBtn
                label={
                  isStreaming
                    ? t.queue.sendAllStreamingTitle
                    : t.queue.sendAllAllTitle
                }
                disabled={pendingCount === 0 || isStreaming}
                onClick={onSendAll}
              >
                <SendHorizonalIcon className="size-3.5" />
              </ActionIconBtn>
            </div>
          )}

          <ul
            id={listId}
            role="list"
            aria-label={t.queue.title}
            className="max-h-44 list-none overflow-y-auto p-0"
            hidden={!listVisible}
          >
            {listVisible &&
              messages.map((msg) => {
                const badge = STATUS_BADGE[msg.status];
                const isEditing = editing?.id === msg.id;
                return (
                  <li
                    key={msg.id}
                    role="listitem"
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-lg py-1 pr-1 pl-2.5",
                      rowCount > 1 &&
                        "border-border/60 border-t first:border-t-0",
                      msg.status === "error" && "bg-red-500/5",
                    )}
                  >
                    {rowCount === 1 && (
                      <LayersIcon
                        aria-hidden
                        className="text-muted-foreground size-3.5 shrink-0"
                      />
                    )}

                    {isEditing ? (
                      <input
                        autoFocus
                        aria-label={t.queue.action.edit}
                        value={editing.text}
                        onChange={(e) =>
                          setEditing({ id: msg.id, text: e.currentTarget.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditing(null);
                            return;
                          }
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            commitEdit();
                          }
                        }}
                        className="border-input bg-background focus:border-primary h-7 min-w-0 flex-1 rounded-md border px-2 text-xs outline-none"
                      />
                    ) : (
                      <>
                        <span
                          className={cn(
                            "text-foreground/80 min-w-0 flex-1 truncate text-[13px]",
                            msg.status === "error" && "text-red-500",
                          )}
                          title={msg.content}
                        >
                          {msg.content}
                        </span>
                        {badge && (
                          <span
                            className={cn(
                              "flex shrink-0 items-center gap-1 text-[10px] font-medium",
                              badge.className,
                            )}
                          >
                            {(msg.status === "injecting" ||
                              msg.status === "sending") && (
                              <Loader2Icon className="size-2.5 animate-spin" />
                            )}
                            {msg.status === "injected" && (
                              <CheckIcon className="size-2.5" />
                            )}
                            {t.queue.status[badge.labelKey]}
                          </span>
                        )}
                      </>
                    )}

                    <div className="flex shrink-0 items-center gap-0.5">
                      {isEditing ? (
                        <>
                          <ActionIconBtn
                            label={t.queue.action.save}
                            disabled={editing.text.trim() === ""}
                            onClick={() => commitEdit()}
                          >
                            <CheckIcon className="size-3.5" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            label={t.queue.action.cancelEdit}
                            onClick={() => setEditing(null)}
                          >
                            <XIcon className="size-3.5" />
                          </ActionIconBtn>
                        </>
                      ) : msg.status === "pending" ? (
                        <>
                          <ActionIconBtn
                            label={t.queue.action.edit}
                            onClick={() =>
                              setEditing({ id: msg.id, text: msg.content })
                            }
                          >
                            <PencilIcon className="size-3.5" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            label={t.queue.action.delete}
                            onClick={() => onRemove(msg.id)}
                          >
                            <Trash2Icon className="size-3.5" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            label={
                              isStreaming
                                ? t.queue.action.steer
                                : t.queue.action.steerUnavailable
                            }
                            disabled={!isStreaming}
                            onClick={() => onInject(msg)}
                            className={cn(
                              isStreaming && "text-blue-600 dark:text-blue-400",
                            )}
                          >
                            <SendIcon className="size-3.5" />
                          </ActionIconBtn>
                        </>
                      ) : msg.status === "error" ? (
                        <>
                          <ActionIconBtn
                            label={t.queue.action.retry}
                            onClick={() => onRetry(msg)}
                          >
                            <RotateCwIcon className="size-3" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            label={t.queue.action.delete}
                            onClick={() => onRemove(msg.id)}
                          >
                            <Trash2Icon className="size-3.5" />
                          </ActionIconBtn>
                        </>
                      ) : msg.status === "injected" ? (
                        <ActionIconBtn
                          label={t.queue.action.deleteInjectedTitle}
                          onClick={() => onRemove(msg.id)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </ActionIconBtn>
                      ) : null}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ActionIconBtn({
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
            "text-muted-foreground hover:text-foreground size-7 rounded-full",
            disabled && "cursor-default opacity-45",
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