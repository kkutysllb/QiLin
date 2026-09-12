import { describe, expect, test } from "vitest";

import {
  createConversationPublishState,
  shouldPublishCall,
  shouldPublishDeliverables,
  shouldPublishResult,
  shouldPublishTurn,
} from "@/core/messages/conversation-event-dedupe";

describe("conversation event dedupe", () => {
  test("publishes each turn and call only once", () => {
    const state = createConversationPublishState();

    expect(shouldPublishTurn(state, "turn-1")).toBe(true);
    expect(shouldPublishTurn(state, "turn-1")).toBe(false);
    expect(shouldPublishCall(state, "turn-1", "call-1")).toBe(true);
    expect(shouldPublishCall(state, "turn-1", "call-1")).toBe(false);
    expect(shouldPublishCall(state, "turn-2", "call-1")).toBe(true);
  });

  test("republishes a tool result only when its error state changes", () => {
    const state = createConversationPublishState();

    expect(shouldPublishResult(state, "turn-1", "call-1", false)).toBe(true);
    expect(shouldPublishResult(state, "turn-1", "call-1", false)).toBe(false);
    expect(shouldPublishResult(state, "turn-1", "call-1", true)).toBe(true);
    expect(shouldPublishResult(state, "turn-1", "call-1", true)).toBe(false);
  });

  test("treats deliverables as an unordered unique path set", () => {
    const state = createConversationPublishState();

    expect(
      shouldPublishDeliverables(state, "turn-1", ["b.md", "a.md", "a.md"]),
    ).toBe(true);
    expect(shouldPublishDeliverables(state, "turn-1", ["a.md", "b.md"])).toBe(
      false,
    );
    expect(shouldPublishDeliverables(state, "turn-1", ["a.md", "c.md"])).toBe(
      true,
    );
  });

  test("does not publish empty identifiers", () => {
    const state = createConversationPublishState();

    expect(shouldPublishTurn(state, "")).toBe(false);
    expect(shouldPublishCall(state, "turn-1", "")).toBe(false);
    expect(shouldPublishResult(state, "", "call-1", false)).toBe(false);
    expect(shouldPublishDeliverables(state, "turn-1", [])).toBe(false);
  });
});
