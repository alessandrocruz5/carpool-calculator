import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

export function weekStart(date: string | Date = new Date()): string {
  return dayjs(date).isoWeekday(1).format("YYYY-MM-DD");
}

export function weekEnd(date: string | Date = new Date()): string {
  return dayjs(date).isoWeekday(5).format("YYYY-MM-DD");
}

export function weekdays(date: string | Date = new Date()): string[] {
  const start = dayjs(date).isoWeekday(1);
  return Array.from({ length: 5 }, (_, i) => start.add(i, "day").format("YYYY-MM-DD"));
}

export function daysSince(date: string | Date): number {
  return dayjs().diff(dayjs(date), "day");
}

export function isTuesday(date: string | Date = new Date()): boolean {
  return dayjs(date).isoWeekday() === 2;
}

export function isFriday(date: string | Date = new Date()): boolean {
  return dayjs(date).isoWeekday() === 5;
}
