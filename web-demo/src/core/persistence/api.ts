import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import type {
  PersistenceStatusResponse,
  PersistenceUsageResponse,
} from "./types";

export async function loadPersistenceStatus(): Promise<PersistenceStatusResponse> {
  const res = await fetch(`${getBackendBaseURL()}/api/persistence/status`);
  if (!res.ok) {
    throw new Error(`Failed to load persistence status (${res.status})`);
  }
  return (await res.json()) as PersistenceStatusResponse;
}

export async function loadPersistenceUsage(): Promise<PersistenceUsageResponse> {
  const res = await fetch(`${getBackendBaseURL()}/api/persistence/usage`);
  if (!res.ok) {
    throw new Error(`Failed to load persistence usage (${res.status})`);
  }
  return (await res.json()) as PersistenceUsageResponse;
}
