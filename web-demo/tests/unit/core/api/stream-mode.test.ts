import { expect, test } from "vitest";

import { sanitizeRunStreamOptions } from "@/core/api/stream-mode";

test("drops unsupported stream modes from array payloads", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamMode: [
      "values",
      "messages-tuple",
      "custom",
      "updates",
      "events",
      "messages",
      "tools",
    ],
  });

  expect(sanitized.streamMode).toEqual([
    "values",
    "messages-tuple",
    "custom",
    "updates",
  ]);
});

test("drops unsupported stream modes from scalar payloads", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamMode: "events",
  });

  // "events" was the only mode → falls back to "values"
  expect(sanitized.streamMode).toBe("values");
});

test("drops 'messages' mode (QiLin uses 'messages-tuple')", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamMode: ["messages", "values"],
  });

  expect(sanitized.streamMode).toEqual(["values"]);
});

test("forces streamResumable to false", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamResumable: true,
    streamMode: "values",
  });

  expect(sanitized.streamResumable).toBe(false);
});

test("forces snake_case stream_resumable to false", () => {
  const sanitized = sanitizeRunStreamOptions({
    stream_resumable: true,
    streamMode: "values",
  });

  expect(sanitized.stream_resumable).toBe(false);
});

test("leaves streamResumable: false untouched", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamResumable: false,
  });

  expect(sanitized.streamResumable).toBe(false);
});

test("handles combined streamMode + streamResumable fix", () => {
  // This mirrors what the SDK 1.6.x useLangGraph hook actually sends:
  // it merges callback-based modes (events, updates, custom) and defaults
  // streamResumable to true when runMetadataStorage is configured.
  const sanitized = sanitizeRunStreamOptions({
    streamMode: ["values", "messages-tuple", "updates", "custom", "events"],
    streamResumable: true,
    streamSubgraphs: true,
  });

  expect(sanitized.streamMode).toEqual([
    "values",
    "messages-tuple",
    "updates",
    "custom",
  ]);
  expect(sanitized.streamResumable).toBe(false);
  expect(sanitized.streamSubgraphs).toBe(true);
});

test("keeps payloads without streamMode or streamResumable untouched", () => {
  const options = {
    streamSubgraphs: true,
  };

  expect(sanitizeRunStreamOptions(options)).toBe(options);
});
