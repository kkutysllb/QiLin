// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/workspace/settings/config/use-config-section", () => ({
  useConfigSection: () => ({
    data: {
      backend: "memory",
      max_trace_content: 10240,
      track_token_usage: true,
    },
    loading: false,
    saving: false,
    error: null,
    save: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { RunEventsForm } from "@/components/workspace/settings/config/settings-forms/run-events-form";

describe("RunEventsForm", () => {
  test("renders max_trace_content input and token usage switch", () => {
    render(<RunEventsForm />);
    expect(screen.getByText(/trace 内容最大长度/i)).toBeTruthy();
    expect(screen.getByText(/记录 Token 用量/i)).toBeTruthy();
  });

  test("shows memory-mode hint about non-persistence", () => {
    render(<RunEventsForm />);
    expect(
      screen.getByText(/运行事件未持久化，重启后历史 trace 将丢失/),
    ).toBeTruthy();
  });
});
