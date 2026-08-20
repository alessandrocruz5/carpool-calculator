import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

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
 *
 * "Today" is resolved in the app's operating timezone (Asia/Manila), NOT the
 * server's — the API runs in UTC on Vercel, but `body.date` is the client's
 * local (Manila) calendar day, so anchoring to UTC would reject a valid same-day
 * trip for the ~8h each morning that the two dates disagree.
 */
const APP_TZ = "Asia/Manila";

/**
 * Normalise an input to an app-timezone `YYYY-MM-DD` calendar date. A plain date
 * string is already tz-agnostic (we keep only its date part); a `Date` instant is
 * projected onto the Manila calendar so the window matches the client's basis.
 */
function toAppDate(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return dayjs(value).tz(APP_TZ).format("YYYY-MM-DD");
}

export function retroWindowStart(today: string | Date = new Date()): string {
  // Date-only string → tz-agnostic; `.day()` is 0 on Sunday, so subtracting it
  // lands on the most recent Sunday (today itself when today is a Sunday).
  const d = dayjs(toAppDate(today));
  return d.subtract(d.day(), "day").format("YYYY-MM-DD");
}

export function retroWindowEnd(today: string | Date = new Date()): string {
  return toAppDate(today);
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
  const d = date.slice(0, 10);
  const { start, end } = retroWindow(today);
  return d >= start && d <= end;
}
