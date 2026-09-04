"use client";

import { InputBox } from "@/components/workspace/input-box";
import { isStaticWebsiteOnly } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";

import type { ChatPageController } from "./use-chat-page-controller";

export interface ChatPageComposerProps {
  controller: ChatPageController;
  /** InputBox 类名（两页的新任务位移差异由页面显式给出）。 */
  className?: string;
  /** InputBox disabled（workspace 页叠加 isUploading，agent 页仅静态站判定）。 */
  disabled?: boolean;
  /**
   * 挂载首帧渲染骨架占位：workspace 页的既有挂载时序——草稿重置 effect
   * 先执行、mountedRef 翻转后的首次渲染才挂 InputBox，保证首帧就是
   * 「未选择」态。agent 页无此门闩。
   */
  mountGate?: boolean;
}

/**
 * InputBox + 静态站 demo 提示的共享装配：12 个队列 props 与提交/停止/
 * 上下文回调全部从 controller 绑定；两页只保留 className / disabled /
 * mountGate 三个显式差异。
 */
export function ChatPageComposer({
  controller,
  className,
  disabled,
  mountGate = false,
}: ChatPageComposerProps) {
  const { t } = useI18n();
  const ready = !mountGate || controller.mountedRef.current;
  return (
    <>
      {ready ? (
        <InputBox
          className={className}
          isNewThread={controller.isNewThread}
          threadId={controller.threadId}
          autoFocus={controller.isNewThread}
          status={controller.inputStatus}
          context={controller.settings.context}
          disabled={disabled}
          onContextChange={controller.handleContextChange}
          onSubmit={controller.handleSubmit}
          onStop={controller.handleStop}
          onEnqueue={controller.handleEnqueue}
          queuedMessages={controller.coordinator.messages}
          onInjectFromQueue={controller.coordinator.injectNow}
          onRemoveFromQueue={controller.coordinator.remove}
          onEditQueued={controller.coordinator.editContent}
          onRetryQueued={controller.handleRetryQueued}
          onSendAllQueued={controller.coordinator.manualSendAll}
          busyEnter={controller.settings.composer.busyEnter}
          onSteer={controller.handleSteer}
        />
      ) : (
        <div
          aria-hidden="true"
          className="bg-background/5 h-32 w-full rounded-2xl"
        />
      )}
      {isStaticWebsiteOnly && (
        <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
          {t.common.notAvailableInDemoMode}
        </div>
      )}
    </>
  );
}
