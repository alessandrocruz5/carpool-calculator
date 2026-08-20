import { describe, expect, it } from "vitest";
import {
  isWithinRetroWindow,
  retroWindow,
  retroWindowEnd,
  retroWindowStart,
} from "./retro";

describe("retro window (Sunday-anchored)", () => {
  // 2026-08-20 is a Thursday; the most-recent Sunday is 2026-08-16.
  const thursday = "2026-08-20";

  it("anchors the start on the most recent Sunday", () => {
    expect(retroWindowStart(thursday)).toBe("2026-08-16");
    expect(retroWindowEnd(thursday)).toBe("2026-08-20");
    expect(retroWindow(thursday)).toEqual({
      start: "2026-08-16",
      end: "2026-08-20",
    });
  });

  it("treats a Sunday as its own window start", () => {
    // 2026-08-16 is a Sunday: the window collapses to that single day.
    expect(retroWindowStart("2026-08-16")).toBe("2026-08-16");
    expect(retroWindowEnd("2026-08-16")).toBe("2026-08-16");
  });

  it("includes both ends of the window", () => {
    expect(isWithinRetroWindow("2026-08-16", thursday)).toBe(true); // Sunday
    expect(isWithinRetroWindow("2026-08-20", thursday)).toBe(true); // today
    expect(isWithinRetroWindow("2026-08-18", thursday)).toBe(true); // mid-week
  });

  it("rejects the day before the window start (previous week)", () => {
    // 2026-08-15 is the Saturday of the previous week.
    expect(isWithinRetroWindow("2026-08-15", thursday)).toBe(false);
  });

  it("rejects future dates", () => {
    expect(isWithinRetroWindow("2026-08-21", thursday)).toBe(false);
    expect(isWithinRetroWindow("2026-09-01", thursday)).toBe(false);
  });
});
