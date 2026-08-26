import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { formatSmartTime } from "@/core/utils/datetime";

// Pin "now" to 2026-08-09 10:00 (Sunday) so the day/week/year boundaries are
// deterministic regardless of when the suite runs.
const NOW = new Date("2026-08-09T10:00:00");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatSmartTime (zh-CN)", () => {
  const locale = "zh-CN" as const;

  test("same day renders time as HH:mm", () => {
    expect(formatSmartTime("2026-08-09T14:30:00", locale)).toBe("14:30");
    expect(formatSmartTime("2026-08-09T00:05:00", locale)).toBe("00:05");
  });

  test("yesterday renders 昨天 label", () => {
    expect(formatSmartTime("2026-08-08T20:00:00", locale)).toBe("昨天");
  });

  test("earlier this week renders short weekday 周X", () => {
    // 2026-08-05 is Wednesday; Monday 08-03 is the week boundary.
    expect(formatSmartTime("2026-08-05T09:00:00", locale)).toBe("周三");
    expect(formatSmartTime("2026-08-03T08:00:00", locale)).toBe("周一");
  });

  test("before this week but same year renders MM-dd", () => {
    // Sunday 08-02 falls into the previous week.
    expect(formatSmartTime("2026-08-02T10:00:00", locale)).toBe("08-02");
    expect(formatSmartTime("2026-01-15T10:00:00", locale)).toBe("01-15");
  });

  test("older than current year renders full date yyyy-MM-dd", () => {
    expect(formatSmartTime("2025-12-25T10:00:00", locale)).toBe("2025-12-25");
  });
});

describe("formatSmartTime (en-US)", () => {
  const locale = "en-US" as const;

  test("same day renders time as HH:mm", () => {
    expect(formatSmartTime("2026-08-09T14:30:00", locale)).toBe("14:30");
  });

  test("yesterday renders Yesterday label", () => {
    expect(formatSmartTime("2026-08-08T20:00:00", locale)).toBe("Yesterday");
  });

  test("earlier this week renders short weekday", () => {
    expect(formatSmartTime("2026-08-05T09:00:00", locale)).toBe("Wed");
  });

  test("before this week but same year renders MM/dd", () => {
    expect(formatSmartTime("2026-08-02T10:00:00", locale)).toBe("08/02");
  });

  test("older than current year renders full date yyyy/MM/dd", () => {
    expect(formatSmartTime("2025-12-25T10:00:00", locale)).toBe("2025/12/25");
  });
});

describe("formatSmartTime guards", () => {
  test("invalid timestamp returns dash placeholder", () => {
    expect(formatSmartTime("", "zh-CN")).toBe("-");
    expect(formatSmartTime("not-a-date", "en-US")).toBe("-");
  });

  test("accepts Date and number inputs", () => {
    expect(formatSmartTime(new Date("2026-08-09T14:30:00"), "zh-CN")).toBe(
      "14:30",
    );
    expect(
      formatSmartTime(new Date("2026-08-09T14:30:00").getTime(), "zh-CN"),
    ).toBe("14:30");
  });
});
