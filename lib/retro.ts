import dayjs from "dayjs";

/**
 * Sunday-anchored backfill window for retroactive trips (Sprint 8, SABAY-47).
 *
 * The window is `[most-recent-Sunday → today]`, inclusive on both ends: a driver
 * may log a forgotten trip for any day of the current (Sunday-started) week up to
 * today, but not earlier weeks and not the future.
 *
 * Deliberately NOT built on `lib/week.ts`, which is Monday-anchored (`isoWeekday`)
 * and drives the Log view — mixing the two anchors would silently shift one of
 * them. This helper uses dayjs's default `.day()` (0 = Sunday … 6 = Saturday) and
 * compares plain `YYYY-MM-DD` strings, which sort lexicographically. Shared with
 * SABAY-49 (the retroactive date picker).
 */
export function retroWindowStart(today: string | Date = new Date()): string {
  const d = dayjs(today);
  // Subtract the weekday index (0 on Sunday) to land on the most recent Sunday,
  // which is today itself when today is a Sunday.
  return d.subtract(d.day(), "day").format("YYYY-MM-DD");
}

export function retroWindowEnd(today: string | Date = new Date()): string {
  return dayjs(today).format("YYYY-MM-DD");
}

export function retroWindow(today: string | Date = new Date()): {
  start: string;
  end: string;
} {
  return { start: retroWindowStart(today), end: retroWindowEnd(today) };
}

/** True when `date` (a `YYYY-MM-DD` string) falls inside the inclusive window. */
export function isWithinRetroWindow(
  date: string,
  today: string | Date = new Date()
): boolean {
  const { start, end } = retroWindow(today);
  return date >= start && date <= end;
}
