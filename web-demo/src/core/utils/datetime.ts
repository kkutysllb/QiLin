import {
  addDays,
  addMonths,
  format,
  formatDistanceToNow,
  isSameDay,
  isThisWeek,
  isThisYear,
  isToday,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { enUS as dateFnsEnUS, zhCN as dateFnsZhCN } from "date-fns/locale";

import { detectLocale, type Locale } from "@/core/i18n";
import { getLocaleFromCookie } from "@/core/i18n/cookies";

function getDateFnsLocale(locale: Locale) {
  switch (locale) {
    case "zh-CN":
      return dateFnsZhCN;
    case "en-US":
    default:
      return dateFnsEnUS;
  }
}

export function formatTimeAgo(date: Date | string | number, locale?: Locale) {
  const effectiveLocale =
    locale ??
    (getLocaleFromCookie() as Locale | null) ??
    // Fallback when cookie is missing (or on first render)
    detectLocale();
  // Guard against invalid/empty timestamps (e.g. a backend returning "" for
  // lastUpdated when there are no memories) -- date-fns would throw
  // "Invalid time value" on `new Date("")`. Return a neutral placeholder.
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return formatDistanceToNow(parsed, {
    addSuffix: true,
    locale: getDateFnsLocale(effectiveLocale),
  });
}

/**
 * Compact "smart" timestamp for space-constrained surfaces such as the
 * sidebar history list. Layers progressively coarser granularity as the
 * moment recedes in time:
 *
 *  - same day      -> `14:30`          (HH:mm)
 *  - yesterday     -> `昨天` / `Yesterday`
 *  - this week     -> `周三` / `Wed`     (locale-aware short weekday)
 *  - this year     -> `08-05` / `08/05`
 *  - older         -> `2025-08-05` / `2025/08/05`
 *
 * Falls back to `"-"` on an unparseable value so callers never throw.
 */
export function formatSmartTime(date: Date | string | number, locale?: Locale) {
  const effectiveLocale =
    locale ??
    (getLocaleFromCookie() as Locale | null) ??
    detectLocale();
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  const dfLocale = getDateFnsLocale(effectiveLocale);
  const isZh = effectiveLocale === "zh-CN";
  if (isToday(parsed)) {
    return format(parsed, "HH:mm", { locale: dfLocale });
  }
  if (isYesterday(parsed)) {
    return isZh ? "昨天" : "Yesterday";
  }
  if (isThisWeek(parsed, { weekStartsOn: 1 })) {
    return format(parsed, "EEE", { locale: dfLocale });
  }
  if (isThisYear(parsed)) {
    return format(parsed, isZh ? "MM-dd" : "MM/dd", { locale: dfLocale });
  }
  return format(parsed, isZh ? "yyyy-MM-dd" : "yyyy/MM/dd", {
    locale: dfLocale,
  });
}

export type ThreadTimeBucket = "recent3" | "thisWeek" | "thisMonth" | "earlier";

/**
 * Classify a moment into one of four non-overlapping sidebar buckets.
 *
 * Buckets (no overlap, ordered from most recent):
 *   - recent3   today + yesterday + day before yesterday
 *   - thisWeek  this ISO week (Mon-based) excluding the recent3 window
 *   - thisMonth this calendar month excluding thisWeek
 *   - earlier   everything else
 *
 * Deterministic via the explicit `now` parameter. Falls back to "earlier"
 * for invalid input so the sidebar never crashes.
 *
 * Implementation note: thisWeek / thisMonth boundaries are computed
 * directly from `now` (rather than via date-fns' `isThisWeek` /
 * `isThisMonth`, which read the system clock) so the explicit `now`
 * argument truly drives the classification.
 */
export function bucketOfThread(
  date: Date | string | number,
  now: Date = new Date(),
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1,
): ThreadTimeBucket {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "earlier";
  }

  // recent3: today, yesterday, day before yesterday (relative to `now`).
  const today = startOfDay(now);
  const dayMinus1 = subDays(today, 1);
  const dayMinus2 = subDays(today, 2);
  const parsedDay = startOfDay(parsed);
  if (
    isSameDay(parsedDay, today) ||
    isSameDay(parsedDay, dayMinus1) ||
    isSameDay(parsedDay, dayMinus2)
  ) {
    return "recent3";
  }

  // thisWeek: parsed falls in [startOfWeek(now), nextWeekStart), based on `now`.
  const weekStart = startOfWeek(now, { weekStartsOn });
  const nextWeekStart = addDays(weekStart, 7);
  const parsedTime = parsed.getTime();
  if (parsedTime >= weekStart.getTime() && parsedTime < nextWeekStart.getTime()) {
    return "thisWeek";
  }

  // thisMonth: parsed falls in [startOfMonth(now), nextMonthStart).
  const monthStart = startOfMonth(now);
  const nextMonthStart = addMonths(monthStart, 1);
  if (
    parsedTime >= monthStart.getTime() &&
    parsedTime < nextMonthStart.getTime()
  ) {
    return "thisMonth";
  }

  return "earlier";
}
