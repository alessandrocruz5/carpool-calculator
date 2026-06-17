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

describe("Model A — per-rider detour distance", () => {
  const gas = 90;

  it("no extra km → identical to base split (backward compatible)", () => {
    const base = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 2, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    const withEmpty = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 2, distanceKm: 21, extraKmByRider: {} },
      gas,
      DEFAULT_SETTINGS
    );
    expect(withEmpty.total).toBe(base.total);
    expect(withEmpty.driverShare).toBe(base.driverShare);
    expect(withEmpty.passengerEach).toBe(base.passengerEach);
    expect(withEmpty.detourByRider).toEqual({});
  });

  it("detour gas = (extraKm / mileage) * gasPrice, charged 100% to that rider", () => {
    const r = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 2, distanceKm: 21, extraKmByRider: { A: 5 } },
      gas,
      DEFAULT_SETTINGS
    );
    // detour: (5/10.5)*90
    expect(r.detourByRider.A).toBe(round2((5 / 10.5) * 90));
    expect(r.detourByRider.B).toBeUndefined();
    // base split is unchanged by the detour
    const base = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 2, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    expect(r.total).toBe(base.total);
    expect(r.driverShare).toBe(base.driverShare);
    expect(r.passengerEach).toBe(base.passengerEach);
  });

  it("zero / negative extra km are ignored", () => {
    const r = calcLeg(
      { leg: "evening", route: "slex", passengerCount: 2, distanceKm: 21, extraKmByRider: { A: 0, B: -3 } },
      gas,
      DEFAULT_SETTINGS
    );
    expect(r.detourByRider).toEqual({});
  });

  it("calcDay adds detour on top of the base share for that rider only", () => {
    const d = calcDay(
      {
        date: "2026-06-14",
        gasPricePhpPerL: gas,
        morning: { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21, extraKmByRider: { A: 6 } },
        evening: { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21 },
      },
      DEFAULT_SETTINGS
    );
    const detour = round2((6 / 10.5) * gas);
    // B has no detour → baseline two-passenger both-leg number
    expect(d.perPassenger.B).toBe(291.75);
    // A pays the same base plus their morning detour
    expect(d.perPassenger.A).toBe(round2(291.75 + detour));
    // driver is unaffected by detours
    expect(d.driverTotal).toBe(194.5);
  });

  it("calcDay with no detour maps matches legacy result exactly", () => {
    const d = calcDay(
      {
        date: "2026-06-14",
        gasPricePhpPerL: gas,
        morning: { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
        evening: { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
      },
      DEFAULT_SETTINGS
    );
    expect(d.perPassenger.A).toBe(466.8);
    expect(d.driverTotal).toBe(311.2);
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

describe("calcLeg explicit applyParking flag", () => {
  const gas = 90;

  it("default (omitted) preserves legacy leg==='morning' behavior", () => {
    const morning = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    const evening = calcLeg(
      { leg: "evening", route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    expect(morning.parkingCost).toBe(DEFAULT_SETTINGS.parkingFeePhp);
    expect(evening.parkingCost).toBe(0);
  });

  it("applyParking overrides the name-based default", () => {
    // evening leg forced to charge parking
    const eveningWithParking = calcLeg(
      { leg: "evening", route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS,
      true
    );
    // morning leg forced to skip parking
    const morningNoParking = calcLeg(
      { leg: "morning", route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS,
      false
    );
    expect(eveningWithParking.parkingCost).toBe(DEFAULT_SETTINGS.parkingFeePhp);
    expect(morningNoParking.parkingCost).toBe(0);
  });

  it("unnamed leg (leg: null) charges no parking by default", () => {
    const r = calcLeg(
      { leg: null, route: "skyway", passengerCount: 1, distanceKm: 21 },
      gas,
      DEFAULT_SETTINGS
    );
    expect(r.parkingCost).toBe(0);
  });
});

describe("calcDay legs[] (N ordered legs)", () => {
  const gas = 90;

  it("2-leg legs[] is byte-identical to the legacy {morning,evening} shape", () => {
    const base = {
      date: "2026-06-18",
      gasPricePhpPerL: gas,
      morning: { route: "skyway" as const, passengerIds: ["A", "B"], distanceKm: 21, extraKmByRider: { A: 5 } },
      evening: { route: "slex" as const, passengerIds: ["A"], distanceKm: 25 },
    };
    const legacy = calcDay(base, DEFAULT_SETTINGS);
    const viaLegs = calcDay(
      { date: base.date, gasPricePhpPerL: base.gasPricePhpPerL, legs: [base.morning, base.evening] },
      DEFAULT_SETTINGS
    );
    expect(viaLegs).toEqual(legacy);
    // Absolute anchor so the legs[] path can't drift in lock-step with legacy:
    // B rides only the morning leg (2p skyway 21km + parking) → (180+164+90)*0.75/2.
    expect(viaLegs.perPassenger.B).toBe(162.75);
  });

  it("1 leg → parking on the only (first) leg; perPassenger is that leg's share", () => {
    const d = calcDay(
      {
        date: "2026-06-18",
        gasPricePhpPerL: gas,
        legs: [{ route: "skyway", passengerIds: ["A"], distanceKm: 21 }],
      },
      DEFAULT_SETTINGS
    );
    // single leg with parking, 1p skyway: total 180+164+90 = 434 → 40/60
    expect(d.legs).toHaveLength(1);
    expect(d.legs[0].parkingCost).toBe(DEFAULT_SETTINGS.parkingFeePhp);
    expect(d.legs[0].total).toBe(434);
    expect(d.perPassenger.A).toBe(round2(434 * 0.6));
    expect(d.driverTotal).toBe(round2(434 * 0.4));
    expect(d.morning).toBe(d.legs[0]);
  });

  it("3 legs → parking only on the first; perPassenger and driverTotal sum all legs", () => {
    const d = calcDay(
      {
        date: "2026-06-18",
        gasPricePhpPerL: gas,
        legs: [
          { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
          { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
          { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
        ],
      },
      DEFAULT_SETTINGS
    );
    expect(d.legs).toHaveLength(3);
    // parking on first leg only
    expect(d.legs[0].parkingCost).toBe(DEFAULT_SETTINGS.parkingFeePhp);
    expect(d.legs[1].parkingCost).toBe(0);
    expect(d.legs[2].parkingCost).toBe(0);
    // third leg has no morning/evening name
    expect(d.legs[2].leg).toBeNull();
    // first leg total 434 (40/60); legs 2 & 3 total 344 each (40/60)
    const firstPass = round2(434 * 0.6); // 260.4
    const otherPass = round2(344 * 0.6); // 206.4
    expect(d.perPassenger.A).toBe(round2(firstPass + otherPass + otherPass));
    const firstDriver = round2(434 * 0.4);
    const otherDriver = round2(344 * 0.4);
    expect(d.driverTotal).toBe(round2(firstDriver + otherDriver + otherDriver));
    // mirror exposes the first two legs
    expect(d.morning).toBe(d.legs[0]);
    expect(d.evening).toBe(d.legs[1]);
  });

  it("sums detours across all legs for the affected rider only", () => {
    const d = calcDay(
      {
        date: "2026-06-18",
        gasPricePhpPerL: gas,
        legs: [
          { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21, extraKmByRider: { A: 4 } },
          { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21 },
          { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21, extraKmByRider: { A: 6 } },
        ],
      },
      DEFAULT_SETTINGS
    );
    const detour = round2((4 / 10.5) * gas) + round2((6 / 10.5) * gas);
    // A and B share the same base across all three legs; A also carries both detours.
    expect(round2(d.perPassenger.A - d.perPassenger.B)).toBe(detour);
  });

  it("mixed ridership across N legs: absent rider pays only their legs", () => {
    const d = calcDay(
      {
        date: "2026-06-18",
        gasPricePhpPerL: gas,
        legs: [
          { route: "skyway", passengerIds: ["A", "B", "C"], distanceKm: 21 },
          { route: "skyway", passengerIds: ["A", "B"], distanceKm: 21 },
          { route: "skyway", passengerIds: ["A"], distanceKm: 21 },
        ],
      },
      DEFAULT_SETTINGS
    );
    // A rode all 3, B rode 2, C rode 1 → A pays most, C least.
    expect(d.perPassenger.A).toBeGreaterThan(d.perPassenger.B);
    expect(d.perPassenger.B).toBeGreaterThan(d.perPassenger.C);
    expect(d.legs[0].passengerCount).toBe(3);
    expect(d.legs[1].passengerCount).toBe(2);
    expect(d.legs[2].passengerCount).toBe(1);
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
