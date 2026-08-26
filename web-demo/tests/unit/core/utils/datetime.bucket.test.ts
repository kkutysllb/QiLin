import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { bucketOfThread } from "@/core/utils/datetime";

// Pin "now" to 2026-08-12 (Wednesday) 10:00, weekStartsOn=1 (Mon).
const NOW = new Date("2026-08-12T10:00:00");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("bucketOfThread", () => {
  test("today falls into recent3", () => {
    expect(bucketOfThread("2026-08-12T14:30:00")).toBe("recent3");
    expect(bucketOfThread("2026-08-12T00:01:00")).toBe("recent3");
  });

  test("yesterday falls into recent3", () => {
    expect(bucketOfThread("2026-08-11T23:59:00")).toBe("recent3");
  });

  test("day before yesterday falls into recent3", () => {
    expect(bucketOfThread("2026-08-10T12:00:00")).toBe("recent3");
  });

  test("Monday 2026-08-10 (day before yesterday) falls into recent3", () => {
    // 2026-08-10 is Monday. Relative to NOW=2026-08-12 (Wed) it is the
    // "day before yesterday", so it belongs to recent3 (not thisWeek).
    expect(bucketOfThread("2026-08-10T09:00:00")).toBe("recent3");
  });

  test("Sunday 2026-08-09 falls into thisMonth (last week, same month)", () => {
    // 2026-08-09 is Sunday of the PREVIOUS ISO week (the ISO week containing
    // NOW=2026-08-12 Wed starts on Mon 2026-08-10). It is still in August,
    // so it should fall into thisMonth.
    expect(bucketOfThread("2026-08-09T15:00:00")).toBe("thisMonth");
  });

  test("last day of previous month falls into earlier", () => {
    // 2026-07-31 (Friday) is in last month → "earlier"
    expect(bucketOfThread("2026-07-31T10:00:00")).toBe("earlier");
  });

  test("Aug 1 falls into thisMonth (not thisWeek)", () => {
    // 2026-08-01 (Saturday) is in this month, not this week.
    expect(bucketOfThread("2026-08-01T10:00:00")).toBe("thisMonth");
  });

  test("last year date falls into earlier", () => {
    expect(bucketOfThread("2025-12-25T10:00:00")).toBe("earlier");
  });

  test("invalid input falls into earlier (safe bucket)", () => {
    expect(bucketOfThread("")).toBe("earlier");
    expect(bucketOfThread("not-a-date")).toBe("earlier");
    expect(bucketOfThread(NaN)).toBe("earlier");
  });

  test("accepts Date and number inputs", () => {
    expect(bucketOfThread(new Date("2026-08-12T14:30:00"))).toBe("recent3");
    expect(
      bucketOfThread(new Date("2026-08-12T14:30:00").getTime()),
    ).toBe("recent3");
  });

  test("now parameter overrides system clock", () => {
    // Pretend today is 2026-08-15 (Saturday).
    const now = new Date("2026-08-15T10:00:00");

    // 2026-08-13 (Thu) is yesterday relative to now=08-15 → recent3
    expect(bucketOfThread("2026-08-13T14:30:00", now)).toBe("recent3");

    // 2026-08-12 (Wed) is 3 days before now=08-15, still in thisWeek
    // (week of Mon 08-10 ~ Sun 08-16, weekStartsOn=1) → thisWeek
    expect(bucketOfThread("2026-08-12T14:30:00", now)).toBe("thisWeek");

    // 2026-07-31 is in July, previous month → earlier
    expect(bucketOfThread("2026-07-31T10:00:00", now)).toBe("earlier");

    // 2026-08-12 with now=2026-08-12 → today → recent3
    expect(
      bucketOfThread("2026-08-12T14:30:00", new Date("2026-08-12T10:00:00")),
    ).toBe("recent3");
  });
});