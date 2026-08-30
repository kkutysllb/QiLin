"use client";

import type { Message } from "@langchain/langgraph-sdk";
import {
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/core/i18n/hooks";
import {
  formatAssistantTime,
  getAssistantPresentationMetadata,
  getVisibleAssistantText,
} from "@/core/messages/rendering";
import type { MessageSegment } from "@/core/messages/segments";
import { formatTokenCount } from "@/core/messages/usage";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export type AssistantMessageFooterProps = {
  message: Message;
  segments: MessageSegment[];
  threadId: string;
  isLoading?: boolean;
  onBranchThread?: () => Promise<void>;
  onRegenerate?: () => void;
};

/** Actions and reliable runtime metadata for one complete assistant turn. */
export function AssistantMessageFooter({
  message,
  segments,
  isLoading = false,
  onBranchThread,
  onRegenerate,
}: AssistantMessageFooterProps) {
  const { locale, t } = useI18n();
  const [isBranching, setIsBranching] = useState(false);
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

  if (isLoading) return null;

  return (
    <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {hasActions && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/conversation-message:opacity-100 focus-within:opacity-100">
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
    </div>
  );
}
