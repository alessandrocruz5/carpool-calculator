import { describe, it, expect } from "vitest";
import { rollingMileage, resolveEffectiveMileage, type Fillup } from "./mileage";

function f(odometerKm: number, liters: number, carId: string | null = null): Fillup {
  return {
    id: `${odometerKm}-${carId ?? "x"}`,
    carId,
    date: "2026-01-01",
    liters,
    totalPhp: 0,
    odometerKm,
  };
}

describe("rollingMileage", () => {
  it("returns null with fewer than 2 fill-ups", () => {
    expect(rollingMileage([])).toBeNull();
    expect(rollingMileage([f(0, 0)])).toBeNull();
  });

  it("computes km per litre across consecutive fill-ups", () => {
    expect(rollingMileage([f(0, 0), f(100, 10)])).toBe(10);
    expect(rollingMileage([f(0, 0), f(100, 10), f(220, 10)])).toBe(11);
  });

  it("returns null when no fuel was consumed", () => {
    expect(rollingMileage([f(0, 0), f(100, 0)])).toBeNull();
  });

  it("filters by carId when supplied", () => {
    const fillups = [
      f(0, 0, "a"),
      f(50, 5, "b"),
      f(100, 10, "a"),
      f(999, 99, "b"),
    ];
    // Car "a": 100 km over 10 L = 10 km/L; car "b" rows are excluded.
    expect(rollingMileage(fillups, 5, "a")).toBe(10);
  });

  it("returns null when the car has fewer than 2 matching fill-ups", () => {
    const fillups = [f(0, 0, "a"), f(100, 10, "b")];
    expect(rollingMileage(fillups, 5, "a")).toBeNull();
  });
});

describe("resolveEffectiveMileage", () => {
  it("car efficiency always wins", () => {
    expect(
      resolveEffectiveMileage({
        carEfficiency: 14,
        override: 12,
        overrideEnabled: true,
        rollingAvg: 10,
      })
    ).toBe(14);
  });

  it("uses the rolling average over the override when the toggle is off", () => {
    expect(
      resolveEffectiveMileage({ override: 12, overrideEnabled: false, rollingAvg: 10 })
    ).toBe(10);
  });

  it("uses the override over the rolling average when the toggle is on", () => {
    expect(
      resolveEffectiveMileage({ override: 12, overrideEnabled: true, rollingAvg: 10 })
    ).toBe(12);
  });

  it("falls back to the override when there is no rolling average, even if off", () => {
    expect(
      resolveEffectiveMileage({ override: 12, overrideEnabled: false, rollingAvg: null })
    ).toBe(12);
  });

  it("falls back to the default when nothing else is available", () => {
    expect(
      resolveEffectiveMileage({ override: 0, overrideEnabled: true, rollingAvg: null })
    ).toBe(10.5);
    expect(resolveEffectiveMileage({ fallback: 9 })).toBe(9);
  });
});
