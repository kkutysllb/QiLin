// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/workspace/settings/config/settings-forms/database-form", () => ({
  DatabaseForm: () => <div data-testid="db-form" />,
}));
vi.mock("@/components/workspace/settings/config/settings-forms/run-events-form", () => ({
  RunEventsForm: () => <div data-testid="events-form" />,
}));
vi.mock("@/components/workspace/settings/persistence-status-dashboard", () => ({
  PersistenceStatusDashboard: () => <div data-testid="dashboard" />,
}));
vi.mock("@/components/workspace/settings/data-directory-table", () => ({
  DataDirectoryTable: () => <div data-testid="dir-table" />,
}));
vi.mock("@/components/workspace/settings/use-apply-and-restart", () => ({
  useApplyAndRestart: () => ({ restarting: false, applyAndRestart: vi.fn() }),
}));

import { DataPersistenceSettingsPage } from "@/components/workspace/settings/data-persistence-settings-page";

describe("DataPersistenceSettingsPage", () => {
  test("renders page title and all three subcomponents", () => {
    render(<DataPersistenceSettingsPage />);
    expect(screen.getByText("数据与持久化")).toBeTruthy();
    expect(screen.getByTestId("dashboard")).toBeTruthy();
    expect(screen.getByTestId("db-form")).toBeTruthy();
    expect(screen.getByTestId("events-form")).toBeTruthy();
    expect(screen.getByTestId("dir-table")).toBeTruthy();
  });

  test("renders apply-and-restart button", () => {
    render(<DataPersistenceSettingsPage />);
    expect(screen.getByRole("button", { name: /应用并重启/ })).toBeTruthy();
  });
});
