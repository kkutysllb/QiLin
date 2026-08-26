import type { BaseStream } from "@langchain/langgraph-sdk";
import { useEffect } from "react";

import { useI18n } from "@/core/i18n/hooks";
import { stripUploadedFilesTag } from "@/core/messages/utils";
import type { AgentThreadState } from "@/core/threads";

import { useThreadChat } from "./chats";
import { FlipDisplay } from "./flip-display";

export function ThreadTitle({
  threadId,
  thread,
}: {
  className?: string;
  threadId: string;
  thread: BaseStream<AgentThreadState>;
}) {
  const { t } = useI18n();
  const { isNewThread } = useThreadChat();
  const rawTitle = thread.values?.title;
  // Strip leaked middleware tags so the title reads naturally even when the
  // assistant used `<uploaded_files>` / `<current_uploads>` blocks as the
  // seed for auto-naming the thread.
  const title = rawTitle ? stripUploadedFilesTag(rawTitle) : null;
  useEffect(() => {
    let _title = t.pages.untitled;

    if (title) {
      _title = title;
    } else if (isNewThread) {
      _title = t.pages.newChat;
    }
    if (thread.isThreadLoading) {
      document.title = `Loading... - ${t.pages.appName}`;
    } else {
      document.title = `${_title} - ${t.pages.appName}`;
    }
  }, [
    isNewThread,
    t.pages.newChat,
    t.pages.untitled,
    t.pages.appName,
    thread.isThreadLoading,
    title,
  ]);

  if (!title) {
    return null;
  }
  return (
    <FlipDisplay uniqueKey={threadId}>
      {title ?? "Untitled"}
    </FlipDisplay>
  );
}
