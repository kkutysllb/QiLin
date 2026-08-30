// @vitest-environment happy-dom
import type { Message } from "@langchain/langgraph-sdk";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AssistantMessageFooter } from "@/components/workspace/chat/assistant-message-footer";
import type { MessageSegment } from "@/core/messages/segments";

const { toastError, toastSuccess, upsertFeedback, deleteFeedback } = vi.hoisted(
  () => ({
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    upsertFeedback: vi.fn(),
    deleteFeedback: vi.fn(),
  }),
);

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

vi.mock("@/core/api/feedback", () => ({
  upsertFeedback,
  deleteFeedback,
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
        feedbackUp: "点赞此回复",
        feedbackDown: "点踩此回复",
        feedbackSubmitted: "已提交反馈",
        feedbackRemoved: "已撤销反馈",
        feedbackFailed: "反馈提交失败",
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

  test("keeps the action row permanently visible (no hover gating)", () => {
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        runId="run-1"
        onBranchThread={vi.fn()}
      />,
    );

    const row = screen.getByTestId("assistant-action-copy").parentElement!;
    expect(row.className).not.toContain("opacity-0");
    expect(row.className).not.toContain("group-hover");
  });

  test("hides feedback buttons without runId and shows them with runId", () => {
    const withoutRun = render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
      />,
    );
    expect(
      screen.queryByTestId("assistant-action-feedback-up"),
    ).toBeNull();
    withoutRun.unmount();

    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        runId="run-1"
      />,
    );
    expect(screen.getByTestId("assistant-action-feedback-up")).toBeTruthy();
    expect(screen.getByTestId("assistant-action-feedback-down")).toBeTruthy();
  });

  test("like submits rating 1 for the resolved run", async () => {
    upsertFeedback.mockResolvedValue({
      feedback_id: "f1",
      rating: 1,
      comment: null,
    });
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        runId="run-1"
      />,
    );

    fireEvent.click(screen.getByTestId("assistant-action-feedback-up"));
    await waitFor(() => {
      expect(upsertFeedback).toHaveBeenCalledWith("thread-1", "run-1", 1);
    });
    expect(
      screen
        .getByTestId("assistant-action-feedback-up")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(toastSuccess).toHaveBeenCalledWith("已提交反馈");
  });

  test("clicking the active rating withdraws it via deleteFeedback", async () => {
    deleteFeedback.mockResolvedValue(undefined);
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        runId="run-1"
      />,
    );

    fireEvent.click(screen.getByTestId("assistant-action-feedback-down"));
    await waitFor(() => {
      expect(upsertFeedback).toHaveBeenCalledWith("thread-1", "run-1", -1);
    });
    fireEvent.click(screen.getByTestId("assistant-action-feedback-down"));
    await waitFor(() => {
      expect(deleteFeedback).toHaveBeenCalledWith("thread-1", "run-1");
    });
    expect(
      screen
        .getByTestId("assistant-action-feedback-down")
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(toastSuccess).toHaveBeenCalledWith("已撤销反馈");
  });

  test("failed feedback reverts the selection and toasts the error", async () => {
    upsertFeedback.mockRejectedValue(new Error("gateway down"));
    render(
      <AssistantMessageFooter
        message={message}
        segments={prose}
        threadId="thread-1"
        runId="run-1"
      />,
    );

    fireEvent.click(screen.getByTestId("assistant-action-feedback-up"));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("反馈提交失败");
    });
    expect(
      screen
        .getByTestId("assistant-action-feedback-up")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
