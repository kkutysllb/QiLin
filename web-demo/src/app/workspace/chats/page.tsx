"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The flat chats list page has been retired.
 *
 * Historical tasks now live in the sidebar, grouped by work mode. Navigating
 * to ``/workspace/chats`` (e.g. from an old bookmark) bounces straight to
 * the new-task page so the user lands in a working surface instead of a
 * stale index.
 *
 * Uses a client-side redirect because the workspace layout is a Client
 * Component that gates children behind an auth check — a Server Component
 * ``redirect()`` would never execute during SSR in this tree.
 */
export default function ChatsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/workspace/chats/new");
  }, [router]);
  return null;
}
