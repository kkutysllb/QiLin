// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/workspace/settings/config/use-config-section", () => ({
  useConfigSection: () => ({
    data: {
      backend: "postgres",
      sqlite_dir: ".qilin/data",
      postgres_url: "postgresql://user:pass@host/db",
      checkpoint_channel_mode: "delta",
      pool_size: 10,
      pool_recycle: 600,
      command_timeout: 60,
    },
    loading: false,
    saving: false,
    error: null,
    save: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { DatabaseForm } from "@/components/workspace/settings/config/settings-forms/database-form";

describe("DatabaseForm", () => {
  test("renders postgres connection url field and pool params in postgres mode", () => {
    render(<DatabaseForm />);
    expect(screen.getByText(/PostgreSQL 连接 URL/i)).toBeTruthy();
    expect(screen.getByText(/连接池大小/i)).toBeTruthy();
    expect(screen.getByText(/连接回收秒数/i)).toBeTruthy();
  });

  test("annotates restart-required and hot-reload fields", () => {
    render(<DatabaseForm />);
    // restart-required 标注出现在后端、连接 URL、checkpoint 模式处
    expect(screen.getAllByText(/⟳.*重启/).length).toBeGreaterThan(0);
    // 热重载标注出现在连接池参数处
    expect(screen.getAllByText(/⚡.*热重载/).length).toBeGreaterThan(0);
  });
});
