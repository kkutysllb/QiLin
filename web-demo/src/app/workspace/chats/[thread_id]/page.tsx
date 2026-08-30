"use client";

import { ArtifactTrigger } from "@/components/workspace/artifacts";
import {
  ChatPageComposer,
  ChatPageMessageList,
  ChatPageShell,
  useChatPageController,
  useSpecificChatMode,
} from "@/components/workspace/chats";
import { TaskTokenSummary } from "@/components/workspace/token-usage/task-token-summary";
import { Welcome } from "@/components/workspace/welcome";
import { isStaticWebsiteOnly } from "@/core/config";


export default function ChatPage() {
  const controller = useChatPageController({ scope: "workspace" });
  // ?mode=skill|cron 新任务预填（仅 workspace 路由的既有行为）。放在
  // controller 之后不影响挂载时序：其内部 effect 只延时预填输入框，与
  // controller 内「草稿重置先于 mountedRef」的顺序约定互不依赖。
  useSpecificChatMode();

  return (
    <ChatPageShell
      controller={controller}
      headerClassName="justify-end"
      header={
        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <ArtifactTrigger />
        </div>
      }
    >
      {/* Main content area: existing conversation OR new-thread welcome */}
      {controller.isNewThread ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
          <div className="mx-auto w-full py-8">
            <Welcome effort={controller.settings.context.reasoning_effort} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 justify-center">
          <ChatPageMessageList
            controller={controller}
            className="size-full pt-10"
          />
        </div>
      )}
      {/* Input box: anchored to the bottom on both new and existing threads */}
      <div className="flex shrink-0 justify-center px-4 pb-4">
        <div className="relative w-full max-w-(--chat-message-width)">
          <ChatPageComposer
            controller={controller}
            className="bg-background/5 w-full"
            disabled={isStaticWebsiteOnly || controller.isUploading}
            mountGate
          />
          <TaskTokenSummary
            className="mt-2"
            messages={controller.thread.messages ?? []}
          />
        </div>
      </div>
    </ChatPageShell>
  );
}
