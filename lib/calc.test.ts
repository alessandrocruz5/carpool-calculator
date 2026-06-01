import { describe, it, expect } from "vitest";
import { calcDay, calcLeg, DEFAULT_SETTINGS, round2 } from "./calc";

describe("calcLeg", () => {
  const gas = 90;

  it("1 passenger morning skyway matches hand calc total ~389", () => {
    const r = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    // gas: (21/10.5)*90 = 180; toll skyway 164; parking 90 -> 434
    expect(r.total).toBe(434);
    expect(r.driverShare).toBe(round2(434 * 0.4));
    expect(r.passengerEach).toBe(round2(434 * 0.6));
  });

  it("solo leg → driver pays 100%", () => {
    const r = calcLeg(
      { leg: "evening", route: "slex", passengerCount: 0, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    expect(r.driverShare).toBe(r.total);
    expect(r.passengerEach).toBe(0);
  });

  it("evening leg has no parking", () => {
    const r = calcLeg(
      { leg: "evening", route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    expect(r.parkingCost).toBe(0);
  });
});

describe("calcDay both-leg full ride matches user hand calc", () => {
  const gas = 90;
  // Driver carpools both ways with skyway both legs (cost 778/day).
  // User hand calcs:
  //   1p: passenger 466.80, driver 311.20
  //   2p: each 291.75, driver 194.50
  //   3p: each 210.06, driver 147.82

  it("1 passenger", () => {
    const d = calcDay(
      {
        date: "2026-05-11",
        gasPricePhpPerL: gas,
        morning: { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
        evening: { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
      },
      DEFAULT_SETTINGS
    );
    expect(d.perPassenger.A).toBe(466.8);
    expect(d.driverTotal).toBe(311.2);
  });

  it("2 passengers", () => {
    const d = calcDay(
      {
        date: "2026-05-11",
        gasPricePhpPerL: gas,
        morning: { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21 },
        evening: { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21 },
      },
      DEFAULT_SETTINGS
    );
    expect(d.perPassenger.A).toBe(291.75);
    expect(d.perPassenger.B).toBe(291.75);
    expect(d.driverTotal).toBe(194.5);
  });

  it("3 passengers", () => {
    const d = calcDay(
      {
        date: "2026-05-11",
        gasPricePhpPerL: gas,
        morning: { route: "skyway", passengerIds: ["A", "B", "C"], distanceKm: 21 },
        evening: { route: "skyway", passengerIds: ["A", "B", "C"], distanceKm: 21 },
      },
      DEFAULT_SETTINGS
    );
    expect(d.perPassenger.A).toBe(210.06);
    expect(d.driverTotal).toBe(147.82);
  });
});

describe("mixed-leg ridership", () => {
  it("3 morning, 2 evening: absent passenger pays only morning share", () => {
    const d = calcDay(
      {
        date: "2026-05-11",
        gasPricePhpPerL: 90,
        morning: { route: "skyway", passengerIds: ["A", "B", "C"], distanceKm: 21 },
        evening: { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21 },
      },
      DEFAULT_SETTINGS
    );
    // C rode only morning → pays just morning passengerEach
    // A and B rode both → morning + evening
    expect(d.perPassenger.C).toBeLessThan(d.perPassenger.A);
    expect(d.perPassenger.A).toBe(d.perPassenger.B);
    // morning leg with 3 passengers uses 19/81 split
    // evening leg with 2 passengers uses 25/75 split
    expect(d.morning.passengerCount).toBe(3);
    expect(d.evening.passengerCount).toBe(2);
  });
});

describe("toll route options", () => {
  it("slex route uses slex toll", () => {
    const r = calcLeg(
      { leg: "evening", route: "slex", passengerCount: 2, distanceKm: 21 },
      90,
      DEFAULT_SETTINGS
    );
    expect(r.tollCost).toBe(124);
  });
});

describe("per-leg distance", () => {
  it("asymmetric legs produce different gas costs", () => {
    const d = calcDay(
      {
        date: "2026-06-01",
        gasPricePhpPerL: 90,
        morning: { route: "skyway", passengerIds: ["A"], distanceKm: 17 },
        evening: { route: "skyway", passengerIds: ["A"], distanceKm: 25 },
      },
      DEFAULT_SETTINGS
    );
    expect(d.morning.gasCost).not.toBe(d.evening.gasCost);
    // morning gas: (17/10.5)*90; evening gas: (25/10.5)*90 → evening higher
    expect(d.morning.gasCost).toBe(round2((17 / 10.5) * 90));
    expect(d.evening.gasCost).toBe(round2((25 / 10.5) * 90));
    expect(d.evening.gasCost).toBeGreaterThan(d.morning.gasCost);
  });
});
