"use client";

import { useEffect, useRef } from "react";

import {
  ArtifactPreviewOverlay,
  useArtifacts,
} from "../artifacts";
import { useThread } from "../messages/context";

interface ChatBoxProps {
  children: React.ReactNode;
  threadId: string;
  /** Legacy prop kept for backward compatibility; the split-screen
   *  panel was removed in favour of the full-screen ArtifactPreviewOverlay. */
  artifactsMode?: "side-panel" | "disabled";
}

function ChatBoxInner({ children, threadId }: ChatBoxProps) {
  const { thread } = useThread();
  const threadIdRef = useRef(threadId);
  const { setArtifacts, deselect } = useArtifacts();

  useEffect(() => {
    if (threadIdRef.current !== threadId) {
      threadIdRef.current = threadId;
      deselect();
    }
    setArtifacts(thread.values.artifacts ?? []);
  }, [threadId, thread.values.artifacts, setArtifacts, deselect]);

  return (
    <div className="relative size-full">
      {children}
      {/* Full-screen artifact preview overlay (download + 返回任务 buttons
          are rendered inside). Lives in the chat root so it covers the
          chat area without depending on the right-context-panel layout. */}
      <ArtifactPreviewOverlay threadId={threadId} />
    </div>
  );
}

export { ChatBoxInner as ChatBox };