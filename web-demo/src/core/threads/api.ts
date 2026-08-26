import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { stripUploadedFilesTag } from "@/core/messages/utils";

export async function fetchThreadTitle(threadId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${getBackendBaseURL()}${threadTitlePath(threadId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json().catch(() => null)) as {
      values?: { title?: unknown } | null;
    } | null;
    const title = payload?.values?.title;
    if (typeof title !== "string" || !title.trim()) return null;
    const cleaned = stripUploadedFilesTag(title);
    return cleaned.trim() || null;
  } catch {
    return null;
  }
}

export function threadTitlePath(threadId: string): string {
  return `/api/threads/${encodeURIComponent(threadId)}`;
}
