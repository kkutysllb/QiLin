"use client";

import { BotIcon, PlusSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AgentWelcome } from "@/components/workspace/agent-welcome";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import {
  ChatPageComposer,
  ChatPageMessageList,
  ChatPageShell,
  useChatPageController,
} from "@/components/workspace/chats";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { Tooltip } from "@/components/workspace/tooltip";
import { useAgent } from "@/core/agents";
import { isStaticWebsiteOnly } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";
import { parseAgentNameFromPath } from "@/core/threads/utils";
import { cn } from "@/lib/utils";


export default function AgentChatPage() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  // In the Electron desktop build, useParams() returns stale values from the
  // pre-rendered new.html RSC payload. Parse agent_name from the real URL.
  // This route requires an agent segment, so an unparseable pathname falls
  // back to "" exactly as the previous local parser did.
  const agentName = parseAgentNameFromPath(pathname) ?? "";
  const { agent } = useAgent(agentName);

  const controller = useChatPageController({ scope: "agent", agentName });

  return (
    <ChatPageShell
      controller={controller}
      headerClassName="gap-2"
      header={
        <>
          {/* Agent badge */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 [-webkit-app-region:no-drag]">
            <BotIcon className="text-primary h-3.5 w-3.5" />
            <span className="text-xs font-medium">
              {agent?.name ?? agentName}
            </span>
          </div>

          <div className="flex w-full items-center text-sm font-medium [-webkit-app-region:no-drag]">
            <ThreadTitle
              threadId={controller.threadId}
              thread={controller.thread}
            />
          </div>
          <div className="mr-4 flex items-center [-webkit-app-region:no-drag]">
            <Tooltip content={t.agents.newChat}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  router.push(controller.newThreadPath);
                }}
              >
                <PlusSquare /> {t.agents.newChat}
              </Button>
            </Tooltip>
            <ArtifactTrigger />
          </div>
        </>
      }
    >
      <div className="flex size-full justify-center">
        <ChatPageMessageList
          controller={controller}
          className={cn("size-full", !controller.isNewThread && "pt-10")}
        />
      </div>

      <div className="absolute right-0 bottom-0 left-0 z-30 flex justify-center px-4">
        <div
          className={cn(
            "relative w-full",
            controller.isNewThread && "-translate-y-[calc(50vh-96px)]",
            controller.isNewThread
              ? "max-w-(--container-width-sm)"
              : "max-w-(--chat-message-width)",
          )}
        >
          {controller.isNewThread && (
            <div
              className={cn(
                "mx-auto w-full max-w-(--container-width-sm)",
              )}
            >
              <AgentWelcome agent={agent} agentName={agentName} />
            </div>
          )}

          <ChatPageComposer
            controller={controller}
            className={cn(
              "bg-background/5 w-full",
              controller.isNewThread ? "" : "-translate-y-4",
            )}
            disabled={isStaticWebsiteOnly}
          />
        </div>
      </div>
    </ChatPageShell>
  );
}
