/** Response models for the /api/persistence/* endpoints. */

export interface DatabaseStatus {
  backend: "memory" | "sqlite" | "postgres";
  persisted: boolean;
  sqlite_dir: string | null;
  thread_count: number;
  checkpoint_count: number;
  run_count: number;
  db_size_bytes: number;
}

export interface RunEventsStatus {
  backend: "memory" | "db" | "jsonl";
  persisted: boolean;
  event_count: number;
  hint: string | null;
}

export interface MemoryStatus {
  enabled: boolean;
  persisted: boolean;
  memory_file: string | null;
  file_size_bytes: number;
}

export interface SandboxDataStatus {
  // QiLin stores user-isolated thread workspaces under {base_dir}/users/, so
  // the dashboard reports the users/ directory as the sandbox-data root.
  threads_root: string;
  total_size_bytes: number;
  thread_dir_count: number;
}

export interface PersistenceStatusResponse {
  database: DatabaseStatus;
  run_events: RunEventsStatus;
  memory: MemoryStatus;
  sandbox_data: SandboxDataStatus;
}

export interface DirectoryUsage {
  path: string;
  label: string;
  size_bytes: number;
}

export interface PersistenceUsageResponse {
  directories: DirectoryUsage[];
  total_size_bytes: number;
}
