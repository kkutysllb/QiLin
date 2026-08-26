import { describe, expect, test } from "vitest";

import {
  formatHumanInputAnsweredValue,
  stripHumanInputFormValuesTrailer,
  type HumanInputRequest,
  type HumanInputResponse,
} from "@/core/messages/human-input";

const request: HumanInputRequest = {
  version: 1,
  kind: "human_input_request",
  source: "ask_clarification",
  request_id: "req-1",
  question: "选择一个方案",
  input_mode: "single_choice",
  options: [
    { id: "opt-a", label: "方案 A（推荐）", value: "plan_a" },
    { id: "opt-b", label: "方案 B", value: "plan_b" },
  ],
};

describe("formatHumanInputAnsweredValue", () => {
  test("option responses display the user-facing label, not the raw value", () => {
    const response: HumanInputResponse = {
      version: 1,
      kind: "human_input_response",
      source: "ask_clarification",
      request_id: "req-1",
      response_kind: "option",
      option_id: "opt-a",
      value: "plan_a",
    };

    expect(formatHumanInputAnsweredValue(request, response)).toBe(
      "方案 A（推荐）",
    );
  });

  test("text responses strip the machine-readable [values] trailer", () => {
    const response: HumanInputResponse = {
      version: 1,
      kind: "human_input_response",
      source: "ask_clarification",
      request_id: "req-1",
      response_kind: "text",
      value: "主题: 深色 [values: {\"theme\":\"dark\"}]",
    };

    expect(formatHumanInputAnsweredValue(request, response)).toBe("主题: 深色");
  });

  test("unknown option ids fall back to the raw value", () => {
    const response: HumanInputResponse = {
      version: 1,
      kind: "human_input_response",
      source: "ask_clarification",
      request_id: "req-1",
      response_kind: "option",
      option_id: "opt-gone",
      value: "custom_value",
    };

    expect(formatHumanInputAnsweredValue(request, response)).toBe(
      "custom_value",
    );
  });
});

describe("stripHumanInputFormValuesTrailer", () => {
  test("removes only the trailing values block", () => {
    expect(
      stripHumanInputFormValuesTrailer(
        "风格: 简约; 语言: 中文 [values: {\"style\":\"minimal\"}]",
      ),
    ).toBe("风格: 简约; 语言: 中文");
  });

  test("leaves plain text untouched", () => {
    expect(stripHumanInputFormValuesTrailer("普通回答")).toBe("普通回答");
  });
});
