"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { parseThreadIdFromPath } from "@/core/threads/utils";
import { uuid } from "@/core/utils/uuid";

export function useThreadChat() {
  const pathname = usePathname();

  const searchParams = useSearchParams();
  const threadIdFromPath = parseThreadIdFromPath(pathname);

  const [threadId, setThreadId] = useState(() => {
    return threadIdFromPath === "new" ? uuid() : threadIdFromPath;
  });

  const [isNewThread, setIsNewThread] = useState(
    () => threadIdFromPath === "new",
  );

  useEffect(() => {
    if (pathname?.endsWith("/new")) {
      setIsNewThread(true);
      setThreadId(uuid());
      return;
    }
    if (threadIdFromPath === "new") {
      return;
    }
    setIsNewThread(false);
    setThreadId(threadIdFromPath);
  }, [pathname, threadIdFromPath]);
  const isMock = searchParams.get("mock") === "true";
  return { threadId, setThreadId, isNewThread, setIsNewThread, isMock };
}
