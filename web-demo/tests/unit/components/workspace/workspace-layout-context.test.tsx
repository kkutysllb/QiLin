// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import {
  WorkspaceLayoutProvider,
  useWorkspaceLayout,
} from "@/components/workspace/workspace-layout-context";

function Probe() {
  const { rightPanelMode, setRightPanelMode } = useWorkspaceLayout();
  return (
    <div>
      <span data-testid="mode">{rightPanelMode}</span>
      <button onClick={() => setRightPanelMode("sidebar")}>switch</button>
    </div>
  );
}

describe("WorkspaceLayoutContext rightPanelMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("defaults to context", () => {
    render(
      <WorkspaceLayoutProvider>
        <Probe />
      </WorkspaceLayoutProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("context");
  });

  test("setRightPanelMode persists to localStorage", () => {
    render(
      <WorkspaceLayoutProvider>
        <Probe />
      </WorkspaceLayoutProvider>,
    );
    act(() => {
      screen.getByText("switch").click();
    });
    expect(localStorage.getItem("kworks.workspace.rightPanelMode")).toBe(
      "sidebar",
    );
    expect(screen.getByTestId("mode").textContent).toBe("sidebar");
  });
});
