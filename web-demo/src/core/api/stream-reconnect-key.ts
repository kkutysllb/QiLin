/**
 * Storage key under which the LangGraph SDK ``useStream`` hook remembers the
 * reconnect run id for a thread. Lives in a dependency-free leaf module so
 * both the API client (sessionStorage cleanup) and the thread stream hooks
 * (localStorage sweep) can derive the identical key without importing each
 * other's machinery.
 */
export function streamReconnectStorageKey(
  threadId: string | null | undefined,
): string {
  return `lg:stream:${threadId}`;
}
