/** Persistence subsystem types — 对应 /api/persistence/* 端点 */

export interface PersistenceStatus {
  database: {
    backend: string;
    persisted: boolean;
    sqlite_dir?: string;
    thread_count: number;
    checkpoint_count: number;
    run_count: number;
    db_size_bytes: number;
  };
  run_events: {
    backend: string;
    persisted: boolean;
    event_count: number;
    hint?: string;
  };
  memory: {
    enabled: boolean;
    persisted: boolean;
    memory_file?: string;
    file_size_bytes: number;
  };
  sandbox_data: {
    threads_root?: string;
    total_size_bytes: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface PersistenceUsage {
  directories: Array<{
    path: string;
    label: string;
    size_bytes: number;
  }>;
}
