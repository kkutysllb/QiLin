// @vitest-environment happy-dom
import type { Message } from "@langchain/langgraph-sdk";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AssistantMessageFooter } from "@/components/workspace/chat/assistant-message-footer";
import type { MessageSegment } from "@/core/messages/segments";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
  },
}));

vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: {
      messageActions: {
        copy: "复制",
        copied: "已复制",
        copyFailed: "复制失败",
        branch: "复制当前线程到新会话",
        branching: "复制中",
        branchFailed: "创建分支失败",
        regenerate: "重新生成",
        noVisibleContent: "没有可复制的正文",
      },
    },
  }),
}));

const message = { type: "ai", content: "正文" } as unknown as Message;
const prose: MessageSegment[] = [{ kind: "prose", content: "可见正文" }];

function installClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

describe("AssistantMessageFooter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installClipboard(vi.fn().mockResolvedValue(undefined));
  });

  test("hides actions while streaming and omits copy without prose", () => {
    const loading = render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        isLoading
        onBranchThread={vi.fn()}
      />,
    );
    expect(loading.queryByTestId("assistant-action-copy")).toBeNull();
    loading.unmount();

    render(
      <AssistantMessageFooter
        message={message}
        segments={[{ kind: "reasoning", content: "只有思考" }]}
        threadId="thread-1"
        onBranchThread={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("assistant-action-copy")).toBeNull();
    expect(screen.getByTestId("assistant-action-branch")).toBeTruthy();
  });

  test("copies visible prose and exposes regenerate when provided", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        onBranchThread={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("assistant-action-copy"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("可见正文");
      expect(
        screen.getByTestId("assistant-action-copy").getAttribute("aria-label"),
      ).toBe("已复制");
    });
    expect(screen.getByTestId("assistant-action-regenerate")).toBeTruthy();
  });

  test("reports clipboard failures without breaking the footer", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    installClipboard(writeText);
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
      />,
    );

    fireEvent.click(screen.getByTestId("assistant-action-copy"));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("复制失败");
    });
    expect(screen.getByTestId("assistant-action-copy")).toBeTruthy();
  });

  test("protects the branch action from duplicate clicks while pending", async () => {
    let resolveBranch!: () => void;
    const branch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBranch = resolve;
        }),
    );
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        onBranchThread={branch}
      />,
    );

    const button = screen.getByTestId("assistant-action-branch");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(branch).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("复制中");

    resolveBranch();
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
  });
});
