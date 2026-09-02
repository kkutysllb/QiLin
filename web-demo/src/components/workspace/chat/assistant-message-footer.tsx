"use client";

import type { Message } from "@langchain/langgraph-sdk";
import {
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  Loader2Icon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteFeedback, upsertFeedback } from "@/core/api/feedback";
import { useI18n } from "@/core/i18n/hooks";
import {
  formatAssistantTime,
  getAssistantPresentationMetadata,
  getVisibleAssistantText,
} from "@/core/messages/rendering";
import type { MessageSegment } from "@/core/messages/segments";
import { formatTurnDuration } from "@/core/messages/turn-timing";
import { formatTokenCount } from "@/core/messages/usage";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

export type AssistantMessageFooterProps = {
  message: Message;
  segments: MessageSegment[];
  threadId: string;
  /** Run that produced this turn — enables per-run like/dislike feedback. */
  runId?: string;
  isLoading?: boolean;
  /** 本轮 turn 的实测总用时（毫秒）；仅本会话实时观测过的 turn 有值。 */
  turnDurationMs?: number;
  onBranchThread?: () => Promise<void>;
  onRegenerate?: () => void;
};

/** Actions and reliable runtime metadata for one complete assistant turn. */
export function AssistantMessageFooter({
  message,
  segments,
  threadId,
  runId,
  isLoading = false,
  turnDurationMs,
  onBranchThread,
  onRegenerate,
}: AssistantMessageFooterProps) {
  const { locale, t } = useI18n();
  const [isBranching, setIsBranching] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<1 | -1 | undefined>();
  const [feedbackPending, setFeedbackPending] = useState(false);
  const { copied, copy } = useCopyToClipboard(1500);
  const metadata = getAssistantPresentationMetadata(message);
  const visibleText = getVisibleAssistantText(segments);
  const hasActions = [
    visibleText.length > 0,
    onBranchThread !== undefined,
    onRegenerate !== undefined,
  ].some(Boolean);

  const handleCopy = useCallback(async () => {
    if (!visibleText) return;
    const ok = await copy(visibleText);
    if (!ok) {
      toast.error(t.messageActions.copyFailed);
    }
  }, [copy, t.messageActions.copyFailed, visibleText]);

  const handleBranch = useCallback(async () => {
    if (!onBranchThread || isBranching) return;
    setIsBranching(true);
    try {
      await onBranchThread();
    } catch {
      toast.error(t.messageActions.branchFailed);
    } finally {
      setIsBranching(false);
    }
  }, [isBranching, onBranchThread, t.messageActions.branchFailed]);

  /**
   * Like/dislike toggle: clicking the active rating withdraws it (DELETE),
   * switching ratings overwrites via upsert. Optimistic UI with revert.
   */
  const handleFeedback = useCallback(
    async (value: 1 | -1) => {
      if (!runId || feedbackPending) return;
      const previous = feedbackRating;
      const next = previous === value ? undefined : value;
      setFeedbackRating(next);
      setFeedbackPending(true);
      try {
        if (next === undefined) {
          await deleteFeedback(threadId, runId);
          toast.success(t.messageActions.feedbackRemoved);
        } else {
          await upsertFeedback(threadId, runId, next);
          toast.success(t.messageActions.feedbackSubmitted);
        }
      } catch {
        setFeedbackRating(previous);
        toast.error(t.messageActions.feedbackFailed);
      } finally {
        setFeedbackPending(false);
      }
    },
    [
      feedbackPending,
      feedbackRating,
      runId,
      t.messageActions.feedbackFailed,
      t.messageActions.feedbackRemoved,
      t.messageActions.feedbackSubmitted,
      threadId,
    ],
  );

  if (isLoading) return null;

  return (
    <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {hasActions && (
        <div className="flex items-center gap-0.5">
          {visibleText && (
            <Button
              data-testid="assistant-action-copy"
              size="icon-sm"
              variant="ghost"
              type="button"
              aria-label={
                copied ? t.messageActions.copied : t.messageActions.copy
              }
              title={copied ? t.messageActions.copied : t.messageActions.copy}
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <CheckIcon className="size-3 text-emerald-500" />
              ) : (
                <CopyIcon className="size-3" />
              )}
            </Button>
          )}
          {onBranchThread && (
            <Button
              data-testid="assistant-action-branch"
              size="icon-sm"
              variant="ghost"
              type="button"
              aria-label={
                isBranching
                  ? t.messageActions.branching
                  : t.messageActions.branch
              }
              title={
                isBranching
                  ? t.messageActions.branching
                  : t.messageActions.branch
              }
              disabled={isBranching}
              onClick={() => void handleBranch()}
            >
              {isBranching ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <GitBranchIcon className="size-3" />
              )}
            </Button>
          )}
          {onRegenerate && (
            <Button
              data-testid="assistant-action-regenerate"
              size="icon-sm"
              variant="ghost"
              type="button"
              aria-label={t.messageActions.regenerate}
              title={t.messageActions.regenerate}
              onClick={onRegenerate}
            >
              <RefreshCwIcon className="size-3" />
            </Button>
          )}
          {runId && (
            <>
              <Button
                data-testid="assistant-action-feedback-up"
                size="icon-sm"
                variant="ghost"
                type="button"
                disabled={feedbackPending}
                aria-label={t.messageActions.feedbackUp}
                title={t.messageActions.feedbackUp}
                aria-pressed={feedbackRating === 1}
                onClick={() => void handleFeedback(1)}
              >
                <ThumbsUpIcon
                  className={cn(
                    "size-3",
                    feedbackRating === 1 && "text-emerald-500",
                  )}
                />
              </Button>
              <Button
                data-testid="assistant-action-feedback-down"
                size="icon-sm"
                variant="ghost"
                type="button"
                disabled={feedbackPending}
                aria-label={t.messageActions.feedbackDown}
                title={t.messageActions.feedbackDown}
                aria-pressed={feedbackRating === -1}
                onClick={() => void handleFeedback(-1)}
              >
                <ThumbsDownIcon
                  className={cn(
                    "size-3",
                    feedbackRating === -1 && "text-rose-500",
                  )}
                />
              </Button>
            </>
          )}
        </div>
      )}
      {metadata.timestamp !== undefined && (
        <span className="whitespace-nowrap">
          {formatAssistantTime(metadata.timestamp, locale)}
        </span>
      )}
      {metadata.model && (
        <span className="max-w-48 truncate" title={metadata.model}>
          {metadata.model}
        </span>
      )}
      {metadata.totalTokens !== undefined && (
        <span className="whitespace-nowrap">
          {formatTokenCount(metadata.totalTokens)} tokens
        </span>
      )}
      {turnDurationMs !== undefined && (
        <span className="whitespace-nowrap tabular-nums">
          {formatTurnDuration(turnDurationMs)}
        </span>
      )}
    </div>
  );
}
